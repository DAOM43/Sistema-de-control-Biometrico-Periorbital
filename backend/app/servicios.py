from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import horario
from app.models import Colaborador, Configuracion, Marcacion, PatronBiometrico


class ErrorSecuencia(Exception):
    pass


@dataclass
class ResultadoRegistro:
    marcacion: Marcacion
    nueva: bool
    detalle: str


def ahora() -> datetime:
    return datetime.now().replace(microsecond=0)


def configuracion_vigente(sesion: Session) -> Configuracion:
    config = sesion.scalar(select(Configuracion).order_by(Configuracion.id.desc()).limit(1))
    if config is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No existe configuración registrada.")
    return config


def patrones_vigentes(sesion: Session) -> list[tuple[int, bytes]]:
    consulta = (
        select(PatronBiometrico.colaborador_id, PatronBiometrico.embedding)
        .join(Colaborador, Colaborador.id == PatronBiometrico.colaborador_id)
        .where(PatronBiometrico.vigente.is_(True), Colaborador.estado == "activo")
    )
    return [(fila[0], fila[1]) for fila in sesion.execute(consulta).all()]


def marcaciones_del_dia(sesion: Session, colaborador_id: int, fecha: date) -> list[Marcacion]:
    return list(sesion.scalars(
        select(Marcacion)
        .where(Marcacion.colaborador_id == colaborador_id, Marcacion.fecha == fecha)
        .order_by(Marcacion.hora, Marcacion.id)
    ))


def _bloquear_colaborador(sesion: Session, colaborador_id: int) -> None:
    # Serializa marcajes simultáneos del mismo colaborador hasta el commit.
    sesion.execute(select(Colaborador.id).where(Colaborador.id == colaborador_id).with_for_update())


def _evaluar(tipo: str, momento: datetime, entrada: Marcacion | None, config: Configuracion) -> horario.Evaluacion:
    if tipo == "entrada":
        return horario.evaluar_entrada(momento, config)
    return horario.evaluar_salida(momento, entrada.hora, config)


def _detalle(evaluacion: horario.Evaluacion, config: Configuracion) -> str:
    return evaluacion.detalle + (" Registro en modo de pruebas." if config.modo_pruebas else "")


def _guardar(sesion: Session, marcacion: Marcacion) -> None:
    sesion.add(marcacion)
    try:
        sesion.flush()
    except IntegrityError as error:
        sesion.rollback()
        raise ErrorSecuencia(str(error.orig).splitlines()[0]) from error


def registrar_marcaje_biometrico(
    sesion: Session, colaborador_id: int, puntaje: float, momento: datetime, config: Configuracion
) -> ResultadoRegistro:
    """Primer registro del día = entrada; cualquier registro posterior = salida."""
    _bloquear_colaborador(sesion, colaborador_id)
    del_dia = marcaciones_del_dia(sesion, colaborador_id, momento.date())
    entrada = next((m for m in del_dia if m.tipo == "entrada"), None)
    ultima = del_dia[-1] if del_dia else None

    if ultima:
        transcurrido = (momento - datetime.combine(ultima.fecha, ultima.hora)).total_seconds()
        if transcurrido < config.intervalo_anti_rebote_segundos:
            sesion.commit()
            return ResultadoRegistro(ultima, False, f"Marcación ya realizada a las {ultima.hora:%H:%M}.")

    tipo = "salida" if entrada else "entrada"
    evaluacion = _evaluar(tipo, momento, entrada, config)
    marcacion = Marcacion(
        colaborador_id=colaborador_id,
        fecha=momento.date(),
        hora=momento.time(),
        tipo=tipo,
        origen_biometrico=True,
        umbral_confianza=Decimal(str(puntaje)),
        es_prueba=config.modo_pruebas,
        observacion_horario=evaluacion.detalle,
        en_horario=evaluacion.en_horario,
        minutos_horario=evaluacion.minutos,
    )
    _guardar(sesion, marcacion)
    sesion.commit()
    return ResultadoRegistro(marcacion, True, _detalle(evaluacion, config))


def registrar_marcaje_manual(
    sesion: Session, colaborador_id: int, tipo: str, momento: datetime, config: Configuracion
) -> ResultadoRegistro:
    """Transcripción de la planilla de contingencia con la misma regla de secuencia."""
    _bloquear_colaborador(sesion, colaborador_id)
    del_dia = marcaciones_del_dia(sesion, colaborador_id, momento.date())
    entrada = next((m for m in del_dia if m.tipo == "entrada"), None)

    if tipo == "entrada" and entrada:
        sesion.rollback()
        raise ErrorSecuencia(f"El colaborador ya tiene una entrada registrada a las {entrada.hora:%H:%M} ese día.")
    if tipo == "salida" and entrada is None:
        sesion.rollback()
        raise ErrorSecuencia("No se puede registrar la salida: primero transcriba la entrada de ese día.")
    if tipo == "salida" and momento.time() < entrada.hora:
        sesion.rollback()
        raise ErrorSecuencia(f"La salida no puede ser anterior a la entrada ({entrada.hora:%H:%M}).")

    evaluacion = _evaluar(tipo, momento, entrada, config)
    marcacion = Marcacion(
        colaborador_id=colaborador_id,
        fecha=momento.date(),
        hora=momento.time(),
        tipo=tipo,
        origen_biometrico=False,
        es_prueba=config.modo_pruebas,
        observacion_horario=evaluacion.detalle,
        en_horario=evaluacion.en_horario,
        minutos_horario=evaluacion.minutos,
    )
    _guardar(sesion, marcacion)
    return ResultadoRegistro(marcacion, True, _detalle(evaluacion, config))