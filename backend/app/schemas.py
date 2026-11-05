import re
from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _politica_password(valor: str) -> str:
    if len(valor) < 8 or not re.search(r"[A-Za-z]", valor) or not re.search(r"\d", valor):
        raise ValueError("La contraseña debe tener al menos 8 caracteres e incluir letras y números.")
    return valor


PasswordSegura = Annotated[str, Field(max_length=128), AfterValidator(_politica_password)]


class Credenciales(BaseModel):
    nombre_usuario: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class UsuarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_usuario: str
    nombre_completo: str
    rol: str
    debe_cambiar_password: bool


class TokenSalida(BaseModel):
    token: str
    usuario: UsuarioSalida


class ColaboradorSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nombre: str
    puesto: str
    estado: str


class ColaboradorEdicion(BaseModel):
    nombre: str = Field(min_length=3, max_length=150)
    puesto: str = Field(min_length=2, max_length=100)


class Imagen(BaseModel):
    imagen: str = Field(description="Imagen JPEG en base64 o data URL")


class SolicitudMarcaje(Imagen):
    codigo: str = Field(min_length=2, max_length=20)


class Enrolamiento(BaseModel):
    codigo: str = Field(min_length=2, max_length=20)
    nombre: str = Field(min_length=3, max_length=150)
    puesto: str = Field(min_length=2, max_length=100)
    muestras: list[str] = Field(min_length=5, max_length=5)
    confirmar_parecido: bool = False


class ResultadoMarcaje(BaseModel):
    resultado: Literal["registrada", "no_reconocido", "no_enrolado", "doble_marcaje", "captura_fallida"]
    mensaje: str
    detalle: str | None = None
    colaborador: ColaboradorSalida | None = None
    tipo: str | None = None
    hora: time | None = None
    confianza: float | None = None


class MarcacionSalida(BaseModel):
    id: int
    colaborador_id: int
    codigo: str
    nombre: str
    fecha: date
    hora: time
    tipo: str
    origen_biometrico: bool
    umbral_confianza: float | None
    es_prueba: bool
    observacion_horario: str
    en_horario: bool
    # Entrada: minutos de retardo. Salida: positivos = tiempo extra, negativos = salida anticipada.
    minutos_horario: int


class ResumenDiario(BaseModel):
    colaborador_id: int
    nombre: str
    entrada: time | None
    salida: time | None
    marcaciones: int


class MarcajeManual(BaseModel):
    colaborador_id: int
    tipo: Literal["entrada", "salida"]
    fecha: date
    hora: time
    observacion: str = Field(min_length=5, max_length=500)


class CambioPassword(BaseModel):
    actual: str = Field(min_length=1, max_length=128)
    nueva: PasswordSegura


class CuentaSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_usuario: str
    nombre_completo: str
    rol: str
    intentos_fallidos: int
    bloqueado_hasta: datetime | None
    debe_cambiar_password: bool
    password_actualizado_en: datetime


class CuentaEdicion(BaseModel):
    nombre_completo: str = Field(min_length=3, max_length=150)


class RestablecimientoPassword(BaseModel):
    password_temporal: PasswordSegura


class ConfiguracionEdicion(BaseModel):
    hora_entrada_oficial: time
    hora_salida_oficial: time
    tolerancia_entrada_min: int = Field(ge=0, le=60)
    dias_laborales: list[int] = Field(min_length=1, max_length=7)
    umbral_reconocimiento: float = Field(ge=0.40, le=0.95)
    intervalo_anti_rebote_segundos: int = Field(ge=5, le=3600)
    modo_pruebas: bool


class ConfiguracionSalida(ConfiguracionEdicion):
    actualizado_en: datetime
    actualizado_por: str | None
