"""Guarda la evaluación de horario de las marcaciones registradas antes del script 08.
Ejecutar una sola vez desde backend/, antes de modificar el horario en Configuración."""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app import horario  # noqa: E402
from app.database import SesionLocal  # noqa: E402
from app.models import Marcacion  # noqa: E402
from app.servicios import configuracion_vigente  # noqa: E402


def main():
    with SesionLocal() as sesion:
        config = configuracion_vigente(sesion)
        marcaciones = sesion.scalars(
            select(Marcacion).order_by(Marcacion.colaborador_id, Marcacion.fecha, Marcacion.hora, Marcacion.id)
        ).all()

        entradas = {}
        actualizadas = 0
        for m in marcaciones:
            if m.tipo == "entrada":
                entradas[(m.colaborador_id, m.fecha)] = m
            if m.observacion_horario is not None:
                continue

            momento = datetime.combine(m.fecha, m.hora)
            entrada = entradas.get((m.colaborador_id, m.fecha))
            if m.tipo == "entrada":
                evaluacion = horario.evaluar_entrada(momento, config)
            elif entrada:
                evaluacion = horario.evaluar_salida(momento, entrada.hora, config)
            else:
                evaluacion = horario.Evaluacion(False, 0, "Salida sin entrada registrada.")

            m.observacion_horario = evaluacion.detalle
            m.en_horario = evaluacion.en_horario
            m.minutos_horario = evaluacion.minutos
            actualizadas += 1

        sesion.commit()
        print(f"Marcaciones revisadas: {len(marcaciones)}")
        print(f"Evaluaciones guardadas: {actualizadas}")
        print(f"Horario usado: {config.hora_entrada_oficial:%H:%M} a {config.hora_salida_oficial:%H:%M}, "
              f"tolerancia {config.tolerancia_entrada_min} min.")


if __name__ == "__main__":
    main()
