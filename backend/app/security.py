from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.database import obtener_sesion
from app.models import Usuario

ALGORITMO = "HS256"
_esquema = HTTPBearer(auto_error=False)

GESTION = ("administrador", "personal_administrativo")
MARCAJE = ("administrador", "personal_administrativo", "recepcion")


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def crear_token(usuario: Usuario) -> str:
    ajustes = obtener_ajustes()
    expira = datetime.now(timezone.utc) + timedelta(minutes=ajustes.jwt_minutos)
    datos = {"sub": str(usuario.id), "rol": usuario.rol, "exp": expira}
    return jwt.encode(datos, ajustes.jwt_secreto, algorithm=ALGORITMO)


def usuario_actual(
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
    if usuario is None:
        raise no_autorizado
    return usuario


def requiere_rol(*roles: str):
    def verificador(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tiene permisos para esta operación.")
        return usuario

    return verificador