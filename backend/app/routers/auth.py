from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.database import obtener_sesion
from app.models import Usuario
from app.schemas import CambioPassword, Credenciales, TokenSalida, UsuarioSalida
from app.security import cifrar_password, crear_token, usuario_actual, verificar_password

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenSalida)
def iniciar_sesion(datos: Credenciales, sesion: Session = Depends(obtener_sesion)):
    ajustes = obtener_ajustes()
    ahora = datetime.now()
    usuario = sesion.scalar(select(Usuario).where(Usuario.nombre_usuario == datos.nombre_usuario))

    if usuario and usuario.bloqueado_hasta and usuario.bloqueado_hasta > ahora:
        minutos = int((usuario.bloqueado_hasta - ahora).total_seconds() // 60) + 1
        raise HTTPException(status.HTTP_423_LOCKED, f"Cuenta bloqueada. Intente en {minutos} minuto(s).")

    if usuario is None or not verificar_password(datos.password, usuario.password_hash):
        if usuario:
            usuario.intentos_fallidos += 1
            if usuario.intentos_fallidos >= ajustes.max_intentos_login:
                usuario.bloqueado_hasta = ahora + timedelta(minutes=ajustes.minutos_bloqueo)
                usuario.intentos_fallidos = 0
            sesion.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos.")

    usuario.intentos_fallidos = 0
    usuario.bloqueado_hasta = None
    sesion.commit()
    return TokenSalida(token=crear_token(usuario), usuario=UsuarioSalida.model_validate(usuario))


@router.get("/yo", response_model=UsuarioSalida)
def sesion_actual(usuario: Usuario = Depends(usuario_actual)):
    return usuario


@router.post("/cambiar-password", response_model=TokenSalida)
def cambiar_password(
    datos: CambioPassword,
    usuario: Usuario = Depends(usuario_actual),
    sesion: Session = Depends(obtener_sesion),
):
    # Solo el administrador cambia su contraseña libremente; las demás cuentas solo tras un restablecimiento.
    if not usuario.debe_cambiar_password and usuario.rol != "administrador":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Solo el administrador puede asignar una nueva contraseña. Solicítele una contraseña temporal.",
        )
    if not verificar_password(datos.actual, usuario.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta.")
    if datos.nueva == datos.actual:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña nueva debe ser distinta de la actual.")

    usuario.password_hash = cifrar_password(datos.nueva)
    usuario.debe_cambiar_password = False
    usuario.password_actualizado_en = datetime.now()
    sesion.commit()
    # El token anterior queda invalidado; se entrega uno nuevo para continuar sin volver a iniciar sesión.
    return TokenSalida(token=crear_token(usuario), usuario=UsuarioSalida.model_validate(usuario))
