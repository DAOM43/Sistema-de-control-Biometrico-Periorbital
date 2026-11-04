from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Credenciales(BaseModel):
    nombre_usuario: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class UsuarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_usuario: str
    nombre_completo: str
    rol: str


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


class Imagen(BaseModel):
    imagen: str = Field(description="Imagen JPEG en base64 o data URL")


class Enrolamiento(BaseModel):
    codigo: str = Field(min_length=2, max_length=20)
    nombre: str = Field(min_length=3, max_length=150)
    puesto: str = Field(min_length=2, max_length=100)
    muestras: list[str] = Field(min_length=5, max_length=5)


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
    observacion: str = Field(min_length=5)

class ColaboradorEdicion(BaseModel):
    nombre: str = Field(min_length=3, max_length=150)
    puesto: str = Field(min_length=2, max_length=100)