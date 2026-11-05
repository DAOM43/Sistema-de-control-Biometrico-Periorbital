from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app import horario
from app.database import obtener_sesion
from app.models import Colaborador, Marcacion
from app.schemas import MarcacionSalida, ResumenDiario
from app.security import GESTION, MARCAJE, requiere_rol
from app.servicios import configuracion_vigente

router = APIRouter(prefix="/api/marcaciones", tags=["Marcaciones"])


@router.get("/hoy", response_model=list[ResumenDiario], dependencies=[Depends(requiere_rol(*MARCAJE))])
def resumen_de_hoy(sesion: Session = Depends(obtener_sesion)):
    entrada = func.min(case((Marcacion.tipo == "entrada", Marcacion.hora)))
    salida = func.max(case((Marcacion.tipo == "salida", Marcacion.hora)))
    filas = sesion.execute(
        select(Colaborador.id, Colaborador.nombre, entrada, salida, func.count(Marcacion.id))
        .join(Marcacion, Marcacion.colaborador_id == Colaborador.id)
        .where(Marcacion.fecha == date.today())
        .group_by(Colaborador.id, Colaborador.nombre)
        .order_by(func.max(Marcacion.hora).desc())
    ).all()

    return [
        ResumenDiario(colaborador_id=i, nombre=n, entrada=e, salida=s, marcaciones=c)
        for i, n, e, s, c in filas
    ]


@router.get("", response_model=list[MarcacionSalida], dependencies=[Depends(requiere_rol(*GESTION))])
def reporte(
    desde: date = Query(...),
    hasta: date = Query(...),
    colaborador_id: int | None = None,
    incluir_pruebas: bool = True,
    sesion: Session = Depends(obtener_sesion),
):
    if hasta < desde:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El rango de fechas no es válido.")

    consulta = (
        select(Marcacion, Colaborador.codigo, Colaborador.nombre)
        .join(Colaborador, Colaborador.id == Marcacion.colaborador_id)
        .where(Marcacion.fecha.between(desde, hasta))
        .order_by(Marcacion.fecha, Colaborador.nombre, Marcacion.hora, Marcacion.id)
    )
    if colaborador_id:
        consulta = consulta.where(Marcacion.colaborador_id == colaborador_id)
    if not incluir_pruebas:
        consulta = consulta.where(Marcacion.es_prueba.is_(False))

    config = configuracion_vigente(sesion)
    entradas: dict[tuple[int, date], Marcacion] = {}
    resultado = []

    for m, codigo, nombre in sesion.execute(consulta).all():
        momento = datetime.combine(m.fecha, m.hora)
        if m.tipo == "entrada":
            entradas[(m.colaborador_id, m.fecha)] = m

        if m.observacion_horario is not None:
            # Evaluación guardada al marcar: no depende de la configuración actual.
            evaluacion = horario.Evaluacion(bool(m.en_horario), m.minutos_horario or 0, m.observacion_horario)
        elif m.tipo == "entrada":
            evaluacion = horario.evaluar_entrada(momento, config)
        else:
            entrada = entradas.get((m.colaborador_id, m.fecha))
            evaluacion = (horario.evaluar_salida(momento, entrada.hora, config) if entrada
                          else horario.Evaluacion(False, 0, "Salida sin entrada en el rango consultado."))

        resultado.append(MarcacionSalida(
            id=m.id,
            colaborador_id=m.colaborador_id,
            codigo=codigo,
            nombre=nombre,
            fecha=m.fecha,
            hora=m.hora,
            tipo=m.tipo,
            origen_biometrico=m.origen_biometrico,
            umbral_confianza=float(m.umbral_confianza) if m.umbral_confianza is not None else None,
            es_prueba=m.es_prueba,
            observacion_horario=evaluacion.detalle,
            en_horario=evaluacion.en_horario,
            minutos_horario=evaluacion.minutos,
        ))
    return resultado