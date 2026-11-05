from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.biometria import periorbital
from app.database import obtener_sesion
from app.models import Colaborador, IntentoNoReconocido, PatronBiometrico, RegistroContingencia, Usuario
from app.schemas import ColaboradorSalida, MarcajeManual, ResultadoMarcaje, SolicitudMarcaje
from app.security import GESTION, MARCAJE, requiere_rol
from app.servicios import (
    ErrorSecuencia,
    ahora,
    configuracion_vigente,
    registrar_marcaje_biometrico,
    registrar_marcaje_manual,
)

router = APIRouter(prefix="/api/marcaje", tags=["Marcaje"])


def _registrar_intento(sesion: Session, motivo: str, colaborador_id: int | None, puntaje: float) -> None:
    sesion.add(IntentoNoReconocido(motivo=motivo, colaborador_cercano=colaborador_id, puntaje=puntaje))
    sesion.commit()


def _colaborador_para_marcar(sesion: Session, codigo: str) -> tuple[Colaborador, PatronBiometrico]:
    codigo = codigo.strip().upper()
    colaborador = sesion.scalar(select(Colaborador).where(Colaborador.codigo == codigo))
    if colaborador is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No existe un colaborador con el código {codigo}.")
    if colaborador.estado != "activo":
        raise HTTPException(status.HTTP_409_CONFLICT, f"El colaborador {codigo} está inactivo.")
    patron = colaborador.patron
    if patron is None or not patron.vigente:
        raise HTTPException(status.HTTP_409_CONFLICT, f"El colaborador {codigo} no tiene patrón biométrico vigente.")
    return colaborador, patron


@router.get("/colaborador/{codigo}", response_model=ColaboradorSalida, dependencies=[Depends(requiere_rol(*MARCAJE))])
def confirmar_codigo(codigo: str, sesion: Session = Depends(obtener_sesion)):
    colaborador, _ = _colaborador_para_marcar(sesion, codigo)
    return colaborador


@router.post("", response_model=ResultadoMarcaje, dependencies=[Depends(requiere_rol(*MARCAJE))])
def marcar(datos: SolicitudMarcaje, sesion: Session = Depends(obtener_sesion)):
    colaborador, patron = _colaborador_para_marcar(sesion, datos.codigo)
    salida = ColaboradorSalida.model_validate(colaborador)

    try:
        embedding = periorbital.generar_embedding(datos.imagen)
    except periorbital.ErrorCaptura as error:
        return ResultadoMarcaje(resultado="captura_fallida", mensaje=str(error), colaborador=salida)

    # Verificación 1 a 1: solo contra el patrón del código digitado.
    config = configuracion_vigente(sesion)
    _, puntaje = periorbital.mejor_coincidencia(embedding, [(colaborador.id, patron.embedding)])

    if puntaje < float(config.umbral_reconocimiento):
        _registrar_intento(sesion, "no_reconocido", colaborador.id, puntaje)
        return ResultadoMarcaje(
            resultado="no_reconocido",
            mensaje=f"El rostro no corresponde al código {colaborador.codigo}.",
            colaborador=salida,
        )

    try:
        registro = registrar_marcaje_biometrico(sesion, colaborador.id, puntaje, ahora(), config)
    except ErrorSecuencia as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))

    marcacion = registro.marcacion
    return ResultadoMarcaje(
        resultado="registrada" if registro.nueva else "doble_marcaje",
        mensaje=f"Marcación registrada: {marcacion.tipo}." if registro.nueva else registro.detalle,
        detalle=registro.detalle if registro.nueva else None,
        colaborador=salida,
        tipo=marcacion.tipo,
        hora=marcacion.hora,
        confianza=puntaje,
    )


@router.post("/contingencia", status_code=status.HTTP_201_CREATED)
def transcribir_contingencia(
    datos: MarcajeManual,
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_rol(*GESTION)),
):
    if sesion.get(Colaborador, datos.colaborador_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Colaborador no encontrado.")

    momento = datetime.combine(datos.fecha, datos.hora)
    if momento > ahora():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No se pueden transcribir marcaciones futuras.")

    try:
        registro = registrar_marcaje_manual(sesion, datos.colaborador_id, datos.tipo, momento,
                                            configuracion_vigente(sesion))
    except ErrorSecuencia as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))

    sesion.add(RegistroContingencia(
        marcacion_id=registro.marcacion.id,
        colaborador_id=datos.colaborador_id,
        observacion=datos.observacion.strip(),
        transcrito_por=usuario.id,
        fecha_transcripcion=ahora(),
    ))
    sesion.commit()
    return {"marcacion_id": registro.marcacion.id, "detalle": registro.detalle}