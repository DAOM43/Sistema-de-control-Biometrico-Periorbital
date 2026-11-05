"""Prueba de verificación 1 a 1: genuinos e impostores. No registra asistencias. Ejecutar desde backend/.

Uso:
    python scripts/prueba_verificacion.py            captura intentos con la cámara
    python scripts/prueba_verificacion.py --resumen  muestra solo los resultados acumulados
"""

import base64
import csv
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.biometria import periorbital  # noqa: E402
from app.database import SesionLocal  # noqa: E402
from app.models import Colaborador  # noqa: E402
from app.servicios import configuracion_vigente  # noqa: E402

ARCHIVO = Path(__file__).with_name("resultados_verificacion.csv")
COLUMNAS = ["fecha_hora", "persona", "codigo_digitado", "tipo", "puntaje", "umbral", "aceptado"]
ANCHO_ENVIO = 960


def a_base64(cuadro) -> str:
    if cuadro.shape[1] > ANCHO_ENVIO:
        cuadro = cv2.resize(cuadro, (ANCHO_ENVIO, int(cuadro.shape[0] * ANCHO_ENVIO / cuadro.shape[1])))
    _, jpg = cv2.imencode(".jpg", cuadro, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return "data:image/jpeg;base64," + base64.b64encode(jpg).decode()


def patron_de(sesion, codigo: str) -> bytes:
    colaborador = sesion.scalar(select(Colaborador).where(Colaborador.codigo == codigo))
    if colaborador is None or colaborador.patron is None:
        raise ValueError(f"El código {codigo} no existe o no tiene patrón biométrico.")
    return colaborador.patron.embedding


def evaluar(sesion, imagen_b64: str, persona: str, codigo: str, umbral: float) -> dict:
    """Compara la captura solo contra el patrón del código digitado, como el marcaje real."""
    embedding = periorbital.generar_embedding(imagen_b64)
    _, puntaje = periorbital.mejor_coincidencia(embedding, [(0, patron_de(sesion, codigo))])
    return {
        "fecha_hora": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "persona": persona,
        "codigo_digitado": codigo,
        "tipo": "genuino" if persona == codigo else "impostor",
        "puntaje": f"{puntaje:.4f}",
        "umbral": f"{umbral:.4f}",
        "aceptado": "si" if puntaje >= umbral else "no",
    }


def guardar(fila: dict, archivo: Path = ARCHIVO) -> None:
    nuevo = not archivo.exists()
    with archivo.open("a", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=COLUMNAS)
        if nuevo:
            escritor.writeheader()
        escritor.writerow(fila)


def resumen(archivo: Path = ARCHIVO) -> None:
    if not archivo.exists():
        print("Todavía no hay intentos registrados.")
        return
    with archivo.open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))

    genuinos = [float(r["puntaje"]) for r in filas if r["tipo"] == "genuino"]
    impostores = [float(r["puntaje"]) for r in filas if r["tipo"] == "impostor"]
    umbral = float(filas[-1]["umbral"])

    print(f"\nResultados con el umbral actual ({umbral:.2f})")
    if genuinos:
        rechazados = sum(p < umbral for p in genuinos)
        print(f"  Genuinos:   {len(genuinos):3d} intentos, {rechazados} rechazados  -> FRR = {rechazados / len(genuinos):.1%}")
    if impostores:
        aceptados = sum(p >= umbral for p in impostores)
        print(f"  Impostores: {len(impostores):3d} intentos, {aceptados} aceptados   -> FAR = {aceptados / len(impostores):.1%}")
        if aceptados == 0:
            print(f"  Regla del tres: FAR menor a {3 / len(impostores):.1%} con 95% de confianza")

    if genuinos and impostores:
        menor_genuino, mayor_impostor = min(genuinos), max(impostores)
        print(f"\n  Confianza más baja de un genuino:   {menor_genuino:.3f}")
        print(f"  Confianza más alta de un impostor:  {mayor_impostor:.3f}")
        if mayor_impostor < menor_genuino:
            print(f"  Umbral recomendado: entre {mayor_impostor:.2f} y {menor_genuino:.2f} (sin errores en esta muestra)")
        else:
            print("  Hay solapamiento: ningún umbral separa por completo a genuinos e impostores en esta muestra.")

        print("\n  Umbral   FAR      FRR")
        for centesimas in range(50, 72, 2):
            u = centesimas / 100
            far = sum(p >= u for p in impostores) / len(impostores)
            frr = sum(p < u for p in genuinos) / len(genuinos)
            print(f"  {u:.2f}    {far:6.1%}   {frr:6.1%}")


def capturar(camara):
    while True:
        ok, cuadro = camara.read()
        if not ok:
            sys.exit("No se pudo leer la cámara.")
        vista = cv2.flip(cuadro, 1)
        cv2.putText(vista, "ESPACIO: capturar   ESC: cancelar", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.imshow("Prueba de verificacion", vista)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == 32:
            return cuadro
        if tecla == 27:
            return None


def main():
    if "--resumen" in sys.argv:
        resumen()
        return

    camara = cv2.VideoCapture(0, cv2.CAP_DSHOW) if sys.platform.startswith("win") else cv2.VideoCapture(0)
    if not camara.isOpened():
        sys.exit("No se encontró una cámara disponible.")

    print("Deje vacío el código de la persona y presione Enter para terminar.")
    try:
        with SesionLocal() as sesion:
            umbral = float(configuracion_vigente(sesion).umbral_reconocimiento)
            while True:
                persona = input("\nCódigo de la persona frente a la cámara: ").strip().upper()
                if not persona:
                    break
                codigo = input("Código que digita: ").strip().upper()

                cuadro = capturar(camara)
                if cuadro is None:
                    print("  Intento cancelado.")
                    continue
                try:
                    fila = evaluar(sesion, a_base64(cuadro), persona, codigo, umbral)
                except (periorbital.ErrorCaptura, ValueError) as error:
                    print(f"  No se registró: {error}")
                    continue
                guardar(fila)
                print(f"  {fila['tipo']}: confianza {fila['puntaje']}, {'ACEPTADO' if fila['aceptado'] == 'si' else 'RECHAZADO'}")
    finally:
        camara.release()
        cv2.destroyAllWindows()

    resumen()


if __name__ == "__main__":
    main()