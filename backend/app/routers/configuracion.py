from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import obtener_sesion
from app.models import Configuracion, Usuario
from app.schemas import ConfiguracionEdicion, ConfiguracionSalida
from app.security import ADMINISTRADOR, requiere_rol
from app.servicios import configuracion_vigente

router = APIRouter(prefix="/api/configuracion", tags=["Configuración"])


def _salida(sesion: Session, config: Configuracion) -> ConfiguracionSalida:
    responsable = sesion.get(Usuario, config.actualizado_por) if config.actualizado_por else None
    return ConfiguracionSalida(
        hora_entrada_oficial=config.hora_entrada_oficial,
        hora_salida_oficial=config.hora_salida_oficial,
        tolerancia_entrada_min=config.tolerancia_entrada_min,
        dias_laborales=sorted(config.dias_laborales),
        umbral_reconocimiento=float(config.umbral_reconocimiento),
        intervalo_anti_rebote_segundos=config.intervalo_anti_rebote_segundos,
        modo_pruebas=config.modo_pruebas,
        actualizado_en=config.actualizado_en,
        actualizado_por=responsable.nombre_completo if responsable else None,
    )


@router.get("", response_model=ConfiguracionSalida, dependencies=[Depends(requiere_rol(*ADMINISTRADOR))])
def obtener(sesion: Session = Depends(obtener_sesion)):
    return _salida(sesion, configuracion_vigente(sesion))


@router.put("", response_model=ConfiguracionSalida)
def actualizar(
    datos: ConfiguracionEdicion,
    administrador: Usuario = Depends(requiere_rol(*ADMINISTRADOR)),
    sesion: Session = Depends(obtener_sesion),
):
    config = configuracion_vigente(sesion)
    dias = sorted(set(datos.dias_laborales))

    if datos.hora_entrada_oficial >= datos.hora_salida_oficial:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La hora de salida debe ser posterior a la hora de entrada.")
    if any(d < 1 or d > 7 for d in dias):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Los días laborales deben estar entre lunes (1) y domingo (7).")
    # El modo de pruebas solo se apaga desde la pantalla; reactivarlo requiere hacerlo directamente en la base de datos.
    if datos.modo_pruebas and not config.modo_pruebas:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El modo de pruebas no puede reactivarse desde el sistema.")

    config.hora_entrada_oficial = datos.hora_entrada_oficial
    config.hora_salida_oficial = datos.hora_salida_oficial
    config.tolerancia_entrada_min = datos.tolerancia_entrada_min
    config.dias_laborales = dias
    config.umbral_reconocimiento = Decimal(str(round(datos.umbral_reconocimiento, 4)))
    config.intervalo_anti_rebote_segundos = datos.intervalo_anti_rebote_segundos
    config.modo_pruebas = datos.modo_pruebas
    config.actualizado_por = administrador.id
    sesion.commit()
    sesion.refresh(config)
    return _salida(sesion, config)
