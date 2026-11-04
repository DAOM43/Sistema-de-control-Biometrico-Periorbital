from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.biometria import periorbital
from app.database import obtener_sesion
from app.models import Colaborador, PatronBiometrico, Usuario
from app.schemas import ColaboradorSalida, Enrolamiento, Imagen
from app.security import GESTION, requiere_rol
from app.servicios import configuracion_vigente, patrones_vigentes

router = APIRouter(prefix="/api/enrolamiento", tags=["Enrolamiento"])


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
    existente_id, puntaje = periorbital.mejor_coincidencia(patron, patrones_vigentes(sesion))
    if existente_id and puntaje >= umbral:
        existente = sesion.get(Colaborador, existente_id)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"El patrón capturado coincide con {existente.nombre} ({existente.codigo}).",
        )

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