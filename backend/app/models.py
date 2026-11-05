from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import ARRAY, BigInteger, ForeignKey, LargeBinary, Numeric, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre_usuario: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nombre_completo: Mapped[str] = mapped_column(String(150))
    rol: Mapped[str] = mapped_column(String(30))
    intentos_fallidos: Mapped[int] = mapped_column(SmallInteger, default=0)
    bloqueado_hasta: Mapped[datetime | None]
    debe_cambiar_password: Mapped[bool] = mapped_column(default=False)
    password_actualizado_en: Mapped[datetime] = mapped_column(server_default=func.now())
    creado_en: Mapped[datetime] = mapped_column(server_default=func.now())


class Colaborador(Base):
    __tablename__ = "colaboradores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    nombre: Mapped[str] = mapped_column(String(150))
    puesto: Mapped[str] = mapped_column(String(100))
    estado: Mapped[str] = mapped_column(String(20), default="activo")
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(server_default=func.now())

    patron: Mapped["PatronBiometrico | None"] = relationship(back_populates="colaborador", uselist=False)


class PatronBiometrico(Base):
    __tablename__ = "patrones_biometricos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    colaborador_id: Mapped[int] = mapped_column(ForeignKey("colaboradores.id"), unique=True)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    num_muestras: Mapped[int] = mapped_column(SmallInteger, default=5)
    fecha_captura: Mapped[datetime] = mapped_column(server_default=func.now())
    vigente: Mapped[bool] = mapped_column(default=True)

    colaborador: Mapped[Colaborador] = relationship(back_populates="patron")


class Marcacion(Base):
    __tablename__ = "marcaciones"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    colaborador_id: Mapped[int] = mapped_column(ForeignKey("colaboradores.id"))
    fecha: Mapped[date]
    hora: Mapped[time]
    tipo: Mapped[str] = mapped_column(String(10))
    origen_biometrico: Mapped[bool] = mapped_column(default=True)
    umbral_confianza: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    es_prueba: Mapped[bool] = mapped_column(default=False)
    creado_en: Mapped[datetime] = mapped_column(server_default=func.now())


class RegistroContingencia(Base):
    __tablename__ = "registros_contingencia"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    marcacion_id: Mapped[int | None] = mapped_column(ForeignKey("marcaciones.id"), unique=True)
    colaborador_id: Mapped[int] = mapped_column(ForeignKey("colaboradores.id"))
    observacion: Mapped[str] = mapped_column(Text)
    transcrito_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    fecha_transcripcion: Mapped[datetime | None]
    creado_en: Mapped[datetime] = mapped_column(server_default=func.now())


class Configuracion(Base):
    __tablename__ = "configuracion"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    umbral_reconocimiento: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    intervalo_anti_rebote_segundos: Mapped[int]
    hora_entrada_oficial: Mapped[time]
    hora_salida_oficial: Mapped[time]
    tolerancia_entrada_min: Mapped[int] = mapped_column(SmallInteger)
    dias_laborales: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger))
    modo_pruebas: Mapped[bool]
    actualizado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    actualizado_en: Mapped[datetime] = mapped_column(server_default=func.now())


class IntentoNoReconocido(Base):
    __tablename__ = "intentos_no_reconocidos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fecha_hora: Mapped[datetime] = mapped_column(server_default=func.now())
    motivo: Mapped[str] = mapped_column(String(20))
    colaborador_cercano: Mapped[int | None] = mapped_column(ForeignKey("colaboradores.id"))
    puntaje: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    revisado: Mapped[bool] = mapped_column(default=False)
    revisado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))