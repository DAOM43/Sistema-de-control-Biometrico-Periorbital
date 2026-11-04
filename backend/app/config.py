from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    jwt_secreto: str
    jwt_minutos: int = 480
    origenes_cors: str = "http://localhost:5173"
    max_intentos_login: int = 5
    minutos_bloqueo: int = 15

    @property
    def lista_origenes(self) -> list[str]:
        return [o.strip() for o in self.origenes_cors.split(",") if o.strip()]


@lru_cache
def obtener_ajustes() -> Ajustes:
    return Ajustes()