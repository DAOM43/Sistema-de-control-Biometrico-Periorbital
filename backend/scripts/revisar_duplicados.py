"""Lista colaboradores cuyos patrones biométricos coinciden entre sí. Ejecutar desde backend/."""

import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.biometria import periorbital  # noqa: E402
from app.database import SesionLocal  # noqa: E402
from app.models import Colaborador, PatronBiometrico  # noqa: E402
from app.servicios import configuracion_vigente  # noqa: E402


def main():
    with SesionLocal() as sesion:
        umbral = float(configuracion_vigente(sesion).umbral_reconocimiento)
        filas = sesion.execute(
            select(Colaborador.codigo, Colaborador.nombre, Colaborador.estado, PatronBiometrico.embedding)
            .join(PatronBiometrico, PatronBiometrico.colaborador_id == Colaborador.id)
            .order_by(Colaborador.codigo)
        ).all()

    coincidencias = []
    for a, b in combinations(filas, 2):
        distancia = float(np.linalg.norm(periorbital.desde_bytes(a.embedding) - periorbital.desde_bytes(b.embedding)))
        puntaje = periorbital.confianza(distancia)
        if puntaje >= umbral:
            coincidencias.append((puntaje, a, b))

    print(f"Patrones revisados: {len(filas)}. Umbral: {umbral:.2f}")
    if not coincidencias:
        print("No hay colaboradores duplicados.")
        return
    print("Posibles duplicados (misma persona registrada más de una vez):")
    for puntaje, a, b in sorted(coincidencias, key=lambda c: c[0], reverse=True):
        print(f"  {puntaje:.3f}  {a.codigo} {a.nombre} ({a.estado})  <->  {b.codigo} {b.nombre} ({b.estado})")


if __name__ == "__main__":
    main()