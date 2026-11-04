"""Evaluación de cada marcación frente al horario oficial. Informa, no bloquea."""

from dataclasses import dataclass
from datetime import date, datetime, time

DIAS = {1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado", 7: "domingo"}


@dataclass(frozen=True)
class Evaluacion:
    en_horario: bool
    minutos: int
    detalle: str


def _minutos_entre(posterior: time, anterior: time) -> int:
    diferencia = datetime.combine(date.min, posterior) - datetime.combine(date.min, anterior)
    return int(diferencia.total_seconds() // 60)


def _duracion(minutos: int) -> str:
    horas, resto = divmod(abs(minutos), 60)
    return f"{horas} h {resto:02d} min" if horas else f"{resto} min"


def es_dia_laboral(momento: datetime, dias_laborales: list[int]) -> bool:
    return momento.isoweekday() in dias_laborales


def evaluar_entrada(momento: datetime, config) -> Evaluacion:
    if not es_dia_laboral(momento, config.dias_laborales):
        return Evaluacion(False, 0, f"Entrada fuera de horario ({DIAS[momento.isoweekday()]}).")

    hora = momento.time()
    if hora >= config.hora_salida_oficial:
        return Evaluacion(False, 0, "Entrada fuera de horario (después de la jornada).")

    retardo = _minutos_entre(hora, config.hora_entrada_oficial)
    if retardo <= config.tolerancia_entrada_min:
        return Evaluacion(True, 0, "Entrada puntual.")
    return Evaluacion(True, retardo, f"Entrada con retardo de {_duracion(retardo)}.")


def evaluar_salida(momento: datetime, hora_entrada: time, config) -> Evaluacion:
    laborado = _duracion(_minutos_entre(momento.time(), hora_entrada))

    if not es_dia_laboral(momento, config.dias_laborales):
        return Evaluacion(False, 0, f"Salida fuera de horario ({DIAS[momento.isoweekday()]}). Tiempo laborado: {laborado}.")

    diferencia = _minutos_entre(momento.time(), config.hora_salida_oficial)
    if diferencia < 0:
        return Evaluacion(True, diferencia, f"Salida anticipada por {_duracion(diferencia)}. Tiempo laborado: {laborado}.")
    if diferencia > 0:
        return Evaluacion(True, diferencia, f"Tiempo extra de {_duracion(diferencia)}. Tiempo laborado: {laborado}.")
    return Evaluacion(True, 0, f"Salida en horario. Tiempo laborado: {laborado}.")