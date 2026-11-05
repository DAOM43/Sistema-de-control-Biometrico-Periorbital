from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import obtener_sesion
from app.models import Usuario
from app.schemas import CuentaEdicion, CuentaSalida, RestablecimientoPassword
from app.security import ADMINISTRADOR, cifrar_password, requiere_rol

router = APIRouter(prefix="/api/cuentas", tags=["Cuentas"])

ORDEN_ROLES = {"administrador": 0, "personal_administrativo": 1, "recepcion": 2}


def _obtener(sesion: Session, cuenta_id: int) -> Usuario:
    cuenta = sesion.get(Usuario, cuenta_id)
    if cuenta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada.")
    return cuenta


@router.get("", response_model=list[CuentaSalida], dependencies=[Depends(requiere_rol(*ADMINISTRADOR))])
def listar(sesion: Session = Depends(obtener_sesion)):
    cuentas = sesion.scalars(select(Usuario)).all()
    return sorted(cuentas, key=lambda c: (ORDEN_ROLES.get(c.rol, 9), c.nombre_usuario))


@router.put("/{cuenta_id}", response_model=CuentaSalida, dependencies=[Depends(requiere_rol(*ADMINISTRADOR))])
def actualizar(cuenta_id: int, datos: CuentaEdicion, sesion: Session = Depends(obtener_sesion)):
    cuenta = _obtener(sesion, cuenta_id)
    cuenta.nombre_completo = " ".join(datos.nombre_completo.split())
    sesion.commit()
    return cuenta


@router.post("/{cuenta_id}/restablecer-password", response_model=CuentaSalida)
def restablecer_password(
    cuenta_id: int,
    datos: RestablecimientoPassword,
    administrador: Usuario = Depends(requiere_rol(*ADMINISTRADOR)),
    sesion: Session = Depends(obtener_sesion),
):
    cuenta = _obtener(sesion, cuenta_id)
    if cuenta.id == administrador.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Para su propia cuenta use la opción Cambiar contraseña.")
    cuenta.password_hash = cifrar_password(datos.password_temporal)
    cuenta.debe_cambiar_password = True
    cuenta.password_actualizado_en = datetime.now()
    cuenta.intentos_fallidos = 0
    cuenta.bloqueado_hasta = None
    sesion.commit()
    return cuenta


@router.post("/{cuenta_id}/desbloquear", response_model=CuentaSalida, dependencies=[Depends(requiere_rol(*ADMINISTRADOR))])
def desbloquear(cuenta_id: int, sesion: Session = Depends(obtener_sesion)):
    cuenta = _obtener(sesion, cuenta_id)
    cuenta.intentos_fallidos = 0
    cuenta.bloqueado_hasta = None
    sesion.commit()
    return cuenta
