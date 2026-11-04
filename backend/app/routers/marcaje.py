from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.biometria import periorbital
from app.database import obtener_sesion
from app.models import Colaborador, IntentoNoReconocido, RegistroContingencia, Usuario
from app.schemas import ColaboradorSalida, Imagen, MarcajeManual, ResultadoMarcaje
from app.security import GESTION, MARCAJE, requiere_rol
from app.servicios import (
    ErrorSecuencia,
    ahora,
    configuracion_vigente,
    patrones_vigentes,
    registrar_marcaje_biometrico,
    registrar_marcaje_manual,
)

router = APIRouter(prefix="/api/marcaje", tags=["Marcaje"])


def _registrar_intento(sesion: Session, motivo: str, colaborador_id: int | None, puntaje: float) -> None:
    sesion.add(IntentoNoReconocido(motivo=motivo, colaborador_cercano=colaborador_id, puntaje=puntaje))
    sesion.commit()


@router.post("", response_model=ResultadoMarcaje, dependencies=[Depends(requiere_rol(*MARCAJE))])
def marcar(datos: Imagen, sesion: Session = Depends(obtener_sesion)):
    try:
        embedding = periorbital.generar_embedding(datos.imagen)
    except periorbital.ErrorCaptura as error:
        return ResultadoMarcaje(resultado="captura_fallida", mensaje=str(error))

    config = configuracion_vigente(sesion)
    umbral = float(config.umbral_reconocimiento)
    colaborador_id, puntaje = periorbital.mejor_coincidencia(embedding, patrones_vigentes(sesion))

    if colaborador_id is None or puntaje < umbral - periorbital.MARGEN_NO_ENROLADO:
        _registrar_intento(sesion, "no_enrolado", colaborador_id, puntaje)
        return ResultadoMarcaje(resultado="no_enrolado", mensaje="No está registrado en el sistema.", confianza=puntaje)

    if puntaje < umbral:
        _registrar_intento(sesion, "no_reconocido", colaborador_id, puntaje)
        return ResultadoMarcaje(resultado="no_reconocido", mensaje="Persona no identificada. Intente de nuevo.",
                                confianza=puntaje)

    colaborador = ColaboradorSalida.model_validate(sesion.get(Colaborador, colaborador_id))
    try:
        registro = registrar_marcaje_biometrico(sesion, colaborador_id, puntaje, ahora(), config)
    except ErrorSecuencia as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))

    marcacion = registro.marcacion
    return ResultadoMarcaje(
        resultado="registrada" if registro.nueva else "doble_marcaje",
        mensaje=f"Marcación registrada: {marcacion.tipo}." if registro.nueva else registro.detalle,
        detalle=registro.detalle if registro.nueva else None,
        colaborador=colaborador,
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