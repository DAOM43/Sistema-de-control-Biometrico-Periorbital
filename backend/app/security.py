from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.database import obtener_sesion
from app.models import Usuario

ALGORITMO = "HS256"
_esquema = HTTPBearer(auto_error=False)

ADMINISTRADOR = ("administrador",)
GESTION = ("administrador", "personal_administrativo")
MARCAJE = ("administrador", "personal_administrativo", "recepcion")

# Rutas disponibles mientras el usuario tiene pendiente el cambio obligatorio de contraseña.
RUTAS_CAMBIO_PENDIENTE = {"/api/auth/yo", "/api/auth/cambiar-password"}


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def cifrar_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def _huella_password(usuario: Usuario) -> str:
    # Cambia con cada contraseña nueva, lo que invalida los tokens emitidos antes del cambio.
    return usuario.password_hash[-12:]


def crear_token(usuario: Usuario) -> str:
    ajustes = obtener_ajustes()
    expira = datetime.now(timezone.utc) + timedelta(minutes=ajustes.jwt_minutos)
    datos = {"sub": str(usuario.id), "rol": usuario.rol, "pwd": _huella_password(usuario), "exp": expira}
    return jwt.encode(datos, ajustes.jwt_secreto, algorithm=ALGORITMO)


def usuario_actual(
    request: Request,
    credenciales: HTTPAuthorizationCredentials | None = Depends(_esquema),
    sesion: Session = Depends(obtener_sesion),
) -> Usuario:
    no_autorizado = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada.")
    if credenciales is None:
        raise no_autorizado
    try:
        datos = jwt.decode(credenciales.credentials, obtener_ajustes().jwt_secreto, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        raise no_autorizado
    usuario = sesion.get(Usuario, int(datos["sub"]))
    if usuario is None or datos.get("pwd") != _huella_password(usuario):
        raise no_autorizado
    if usuario.debe_cambiar_password and request.url.path not in RUTAS_CAMBIO_PENDIENTE:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {"codigo": "cambio_password_requerido", "mensaje": "Debe cambiar su contraseña antes de continuar."},
        )
    return usuario


def requiere_rol(*roles: str):
    def verificador(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tiene permisos para esta operación.")
        return usuario

    return verificador
