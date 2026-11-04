"""Prueba de la regla secuencial y del horario con horas simuladas. Ejecutar desde backend/."""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

from app.database import SesionLocal  # noqa: E402
from app.models import Colaborador, Marcacion  # noqa: E402
from app.servicios import (  # noqa: E402
    ErrorSecuencia,
    configuracion_vigente,
    registrar_marcaje_biometrico,
    registrar_marcaje_manual,
)

CODIGO = "PRUEBA-SEC"
fallos = 0


def verificar(descripcion, condicion, detalle=""):
    global fallos
    fallos += 0 if condicion else 1
    print(f"[{'OK' if condicion else 'FALLA'}] {descripcion}" + (f" -> {detalle}" if detalle else ""))


def limpiar(sesion, colaborador_id):
    sesion.execute(text("DELETE FROM registros_contingencia WHERE colaborador_id = :c"), {"c": colaborador_id})
    sesion.execute(delete(Marcacion).where(Marcacion.colaborador_id == colaborador_id, Marcacion.tipo == "salida"))
    sesion.execute(delete(Marcacion).where(Marcacion.colaborador_id == colaborador_id))
    sesion.commit()


def marcar(sesion, colaborador_id, momento, config):
    r = registrar_marcaje_biometrico(sesion, colaborador_id, 0.90, momento, config)
    return r.marcacion.tipo if r.nueva else "doble_marcaje", r.detalle


def main():
    with SesionLocal() as sesion:
        colaborador = sesion.scalar(select(Colaborador).where(Colaborador.codigo == CODIGO))
        if colaborador is None:
            colaborador = Colaborador(codigo=CODIGO, nombre="Colaborador de prueba", puesto="Pruebas")
            sesion.add(colaborador)
            sesion.commit()
        cid = colaborador.id
        limpiar(sesion, cid)
        config = configuracion_vigente(sesion)

        print("Día laboral (miércoles 7 de octubre de 2026)")
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 7, 12, 40), config)
        verificar("Primer marcaje después del mediodía se guarda como entrada", tipo == "entrada", d)
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 7, 12, 41), config)
        verificar("Marcaje dentro del anti-rebote no crea registro", tipo == "doble_marcaje", d)
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 7, 15, 0), config)
        verificar("Segundo marcaje se guarda como salida", tipo == "salida", d)
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 7, 17, 15), config)
        verificar("Tercer marcaje sigue siendo salida, nunca otra entrada", tipo == "salida", d)

        print("\nFin de semana por la noche (sábado 10 de octubre de 2026)")
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 10, 21, 0), config)
        verificar("Marcaje fuera de horario se permite como entrada", tipo == "entrada", d)
        tipo, d = marcar(sesion, cid, datetime(2026, 10, 10, 21, 5), config)
        verificar("Siguiente marcaje fuera de horario es salida", tipo == "salida", d)

        print("\nContingencia manual (lunes 5 de octubre de 2026)")
        try:
            registrar_marcaje_manual(sesion, cid, "salida", datetime(2026, 10, 5, 16, 30), config)
            verificar("Salida manual sin entrada es rechazada", False)
        except ErrorSecuencia as e:
            verificar("Salida manual sin entrada es rechazada", True, str(e))
        r = registrar_marcaje_manual(sesion, cid, "entrada", datetime(2026, 10, 5, 7, 12), config)
        sesion.commit()
        verificar("Entrada manual se acepta", r.marcacion.tipo == "entrada", r.detalle)
        try:
            registrar_marcaje_manual(sesion, cid, "salida", datetime(2026, 10, 5, 6, 0), config)
            verificar("Salida manual anterior a la entrada es rechazada", False)
        except ErrorSecuencia as e:
            verificar("Salida manual anterior a la entrada es rechazada", True, str(e))

        print("\nProtección en la base de datos (inserción directa, sin pasar por el backend)")
        for descripcion, tipo, fecha in (
            ("Salida directa sin entrada es rechazada por el trigger", "salida", "2026-10-06"),
            ("Segunda entrada del mismo día es rechazada por el índice único", "entrada", "2026-10-07"),
        ):
            try:
                sesion.execute(text(
                    "INSERT INTO marcaciones (colaborador_id, fecha, hora, tipo) VALUES (:c, :f, '18:00', :t)"
                ), {"c": cid, "f": fecha, "t": tipo})
                sesion.commit()
                verificar(descripcion, False)
            except IntegrityError as e:
                sesion.rollback()
                verificar(descripcion, True, str(e.orig).splitlines()[0])

        try:
            sesion.execute(text(
                "UPDATE marcaciones SET tipo = 'salida' WHERE colaborador_id = :c AND tipo = 'entrada'"
            ), {"c": cid})
            sesion.commit()
            verificar("Convertir una entrada en salida es rechazado", False)
        except IntegrityError as e:
            sesion.rollback()
            verificar("Convertir una entrada en salida es rechazado", True, str(e.orig).splitlines()[0])

        limpiar(sesion, cid)
        sesion.delete(sesion.get(Colaborador, cid))
        sesion.commit()

    print(f"\nResultado: {'todas las pruebas pasaron' if fallos == 0 else f'{fallos} prueba(s) fallaron'}")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()