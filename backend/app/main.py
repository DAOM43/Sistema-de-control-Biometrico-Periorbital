from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import obtener_ajustes
from app.routers import auth, colaboradores, configuracion, cuentas, enrolamiento, marcaciones, marcaje

app = FastAPI(
    title="Control Biométrico Periorbital",
    description="API del sistema de control de asistencia del Centro de Salud de Guazacapán.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=obtener_ajustes().lista_origenes,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for modulo in (auth, colaboradores, enrolamiento, marcaje, marcaciones, cuentas, configuracion):
    app.include_router(modulo.router)


@app.get("/api/salud", tags=["Sistema"])
def salud():
    return {"estado": "ok"}


# En el despliegue, el frontend compilado se sirve desde el mismo servidor que la API.
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/{ruta:path}", include_in_schema=False)
    def frontend(ruta: str):
        if ruta.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurso no encontrado.")
        archivo = (FRONTEND / ruta).resolve()
        if ruta and archivo.is_file() and FRONTEND.resolve() in archivo.parents:
            return FileResponse(archivo)
        return FileResponse(FRONTEND / "index.html")
