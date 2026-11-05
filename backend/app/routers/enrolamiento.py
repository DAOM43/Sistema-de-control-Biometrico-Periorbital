from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.biometria import periorbital
from app.database import obtener_sesion
from app.models import Colaborador, PatronBiometrico, Usuario
from app.schemas import ColaboradorSalida, Enrolamiento, Imagen
from app.security import GESTION, requiere_rol
from app.servicios import configuracion_vigente

router = APIRouter(prefix="/api/enrolamiento", tags=["Enrolamiento"])

LIMITE_CONFIRMACION = 0.85


def _mensaje_parecido(existente: Colaborador, puntaje: float, confirmable: bool, es_administrador: bool) -> str:
    mensaje = f"El rostro se parece a {existente.nombre} ({existente.codigo}), con {puntaje:.0%} de confianza."
    if not confirmable:
        if existente.estado == "inactivo":
            return mensaje + " Es la misma persona y está inactiva: reactívela desde Personal."
        return mensaje + " Es la misma persona: no puede registrarse con otro código."
    if es_administrador:
        return mensaje + " Si verificó en persona que son personas distintas, puede confirmar el registro."
    return mensaje + " Solo un administrador puede confirmar que son personas distintas."


def _patrones_registrados(sesion: Session) -> list[tuple[int, bytes]]:
    # Incluye inactivos: una persona desactivada no debe poder registrarse de nuevo con otro código.
    filas = sesion.execute(select(PatronBiometrico.colaborador_id, PatronBiometrico.embedding)).all()
    return [(fila[0], fila[1]) for fila in filas]


@router.post("/muestra", dependencies=[Depends(requiere_rol(*GESTION))])
def validar_muestra(datos: Imagen):
    try:
        _, encuadre = periorbital.analizar_muestra(datos.imagen)
    except periorbital.ErrorCaptura as error:
        return {"valida": False, "mensaje": str(error)}
    return {"valida": True, "mensaje": "Muestra aceptada.", "encuadre": encuadre}


@router.post("", response_model=ColaboradorSalida, status_code=status.HTTP_201_CREATED)
def enrolar(
    datos: Enrolamiento,
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_rol(*GESTION)),
):
    codigo = datos.codigo.strip().upper()
    if sesion.scalar(select(Colaborador.id).where(Colaborador.codigo == codigo)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ya existe un colaborador con el código {codigo}.")

    try:
        embeddings = [periorbital.generar_embedding(m) for m in datos.muestras]
        patron = periorbital.consolidar_muestras(embeddings)
    except periorbital.ErrorCaptura as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))

    umbral = float(configuracion_vigente(sesion).umbral_reconocimiento)
    existente_id, puntaje = periorbital.mejor_coincidencia(patron, _patrones_registrados(sesion))
    if existente_id and puntaje >= umbral:
        existente = sesion.get(Colaborador, existente_id)
        # Un parecido muy alto es casi con certeza la misma persona: no se permite confirmar.
        confirmable = puntaje < LIMITE_CONFIRMACION
        es_administrador = usuario.rol == "administrador"
        if not (datos.confirmar_parecido and confirmable and es_administrador):
            raise HTTPException(status.HTTP_409_CONFLICT, detail={
                "codigo": "rostro_parecido",
                "mensaje": _mensaje_parecido(existente, puntaje, confirmable, es_administrador),
                "coincide_con": {"codigo": existente.codigo, "nombre": existente.nombre, "estado": existente.estado},
                "confianza": puntaje,
                "puede_confirmar": confirmable and es_administrador,
            })

    colaborador = Colaborador(
        codigo=codigo,
        nombre=datos.nombre.strip(),
        puesto=datos.puesto.strip(),
        estado="activo",
        creado_por=usuario.id,
    )
    sesion.add(colaborador)
    sesion.flush()
    sesion.add(PatronBiometrico(
        colaborador_id=colaborador.id,
        embedding=periorbital.a_bytes(patron),
        num_muestras=len(embeddings),
        vigente=True,
    ))
    sesion.commit()
    return colaborador