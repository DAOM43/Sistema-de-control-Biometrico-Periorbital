from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import obtener_sesion
from app.models import Colaborador, PatronBiometrico
from app.schemas import ColaboradorEdicion, ColaboradorSalida
from app.security import GESTION, MARCAJE, requiere_rol

router = APIRouter(prefix="/api/colaboradores", tags=["Personal"])


def _obtener(sesion: Session, colaborador_id: int) -> Colaborador:
    colaborador = sesion.get(Colaborador, colaborador_id)
    if colaborador is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Colaborador no encontrado.")
    return colaborador


@router.get("", response_model=list[ColaboradorSalida], dependencies=[Depends(requiere_rol(*MARCAJE))])
def listar(buscar: str | None = None, sesion: Session = Depends(obtener_sesion)):
    consulta = select(Colaborador).order_by(Colaborador.nombre)
    if buscar:
        patron = f"%{buscar.strip()}%"
        consulta = consulta.where(or_(Colaborador.nombre.ilike(patron), Colaborador.codigo.ilike(patron)))
    return sesion.scalars(consulta).all()


@router.get("/verificar-codigo", dependencies=[Depends(requiere_rol(*GESTION))])
def verificar_codigo(codigo: str, sesion: Session = Depends(obtener_sesion)):
    existe = sesion.scalar(select(Colaborador.id).where(Colaborador.codigo == codigo.strip().upper()))
    return {"disponible": existe is None}

@router.put("/{colaborador_id}", response_model=ColaboradorSalida, dependencies=[Depends(requiere_rol(*GESTION))])
def actualizar(colaborador_id: int, datos: ColaboradorEdicion, sesion: Session = Depends(obtener_sesion)):
    colaborador = _obtener(sesion, colaborador_id)
    colaborador.nombre = datos.nombre.strip()
    colaborador.puesto = datos.puesto.strip()
    sesion.commit()
    return colaborador

@router.post("/{colaborador_id}/desactivar", response_model=ColaboradorSalida,
             dependencies=[Depends(requiere_rol(*GESTION))])
def desactivar(colaborador_id: int, sesion: Session = Depends(obtener_sesion)):
    colaborador = _obtener(sesion, colaborador_id)
    colaborador.estado = "inactivo"
    if colaborador.patron:
        colaborador.patron.vigente = False
    sesion.commit()
    return colaborador


@router.post("/{colaborador_id}/reactivar", response_model=ColaboradorSalida,
             dependencies=[Depends(requiere_rol(*GESTION))])
def reactivar(colaborador_id: int, sesion: Session = Depends(obtener_sesion)):
    colaborador = _obtener(sesion, colaborador_id)
    patron = sesion.scalar(select(PatronBiometrico).where(PatronBiometrico.colaborador_id == colaborador.id))
    if patron is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "El colaborador no tiene patrón biométrico. Debe enrolarse de nuevo.")
    patron.vigente = True
    colaborador.estado = "activo"
    sesion.commit()
    return colaborador