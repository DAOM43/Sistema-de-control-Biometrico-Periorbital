from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
