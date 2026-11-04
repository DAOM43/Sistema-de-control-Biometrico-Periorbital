-- Estructura de almacenamiento 
SET ROLE cbp_app;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
    id                 BIGSERIAL PRIMARY KEY,
    nombre_usuario     VARCHAR(50)  NOT NULL UNIQUE,
    password_hash      VARCHAR(255) NOT NULL,
    nombre_completo    VARCHAR(150) NOT NULL,
    rol                VARCHAR(30)  NOT NULL
                       CHECK (rol IN ('administrador', 'personal_administrativo', 'recepcion')),
    intentos_fallidos  SMALLINT     NOT NULL DEFAULT 0,
    bloqueado_hasta    TIMESTAMP,
    creado_en          TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE colaboradores (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20)  NOT NULL UNIQUE,
    nombre          VARCHAR(150) NOT NULL,
    puesto          VARCHAR(100) NOT NULL,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo', 'inactivo')),
    creado_por      BIGINT REFERENCES usuarios (id),
    creado_en       TIMESTAMP    NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE patrones_biometricos (
    id              BIGSERIAL PRIMARY KEY,
    colaborador_id  BIGINT    NOT NULL UNIQUE
                    REFERENCES colaboradores (id) ON DELETE CASCADE,
    embedding       BYTEA     NOT NULL,
    num_muestras    SMALLINT  NOT NULL DEFAULT 5 CHECK (num_muestras > 0),
    fecha_captura   TIMESTAMP NOT NULL DEFAULT now(),
    vigente         BOOLEAN   NOT NULL DEFAULT TRUE
);

-- El historial se conserva aunque el colaborador quede inactivo (RESTRICT).
CREATE TABLE marcaciones (
    id                 BIGSERIAL PRIMARY KEY,
    colaborador_id     BIGINT      NOT NULL REFERENCES colaboradores (id) ON DELETE RESTRICT,
    fecha              DATE        NOT NULL,
    hora               TIME        NOT NULL,
    tipo               VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
    origen_biometrico  BOOLEAN     NOT NULL DEFAULT TRUE,
    umbral_confianza   NUMERIC(5,4) CHECK (umbral_confianza BETWEEN 0 AND 1),
    creado_en          TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX ix_marcaciones_colaborador_fecha ON marcaciones (colaborador_id, fecha, hora);
CREATE INDEX ix_marcaciones_fecha ON marcaciones (fecha);

CREATE TABLE registros_contingencia (
    id                   BIGSERIAL PRIMARY KEY,
    marcacion_id         BIGINT UNIQUE REFERENCES marcaciones (id) ON DELETE SET NULL,
    colaborador_id       BIGINT    NOT NULL REFERENCES colaboradores (id) ON DELETE RESTRICT,
    observacion          TEXT      NOT NULL,
    transcrito_por       BIGINT REFERENCES usuarios (id),
    fecha_transcripcion  TIMESTAMP,
    creado_en            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE configuracion (
    id                              BIGSERIAL PRIMARY KEY,
    umbral_reconocimiento           NUMERIC(5,4) NOT NULL
                                    CHECK (umbral_reconocimiento BETWEEN 0 AND 1),
    horario_corte_turno             TIME    NOT NULL,
    intervalo_anti_rebote_segundos  INTEGER NOT NULL CHECK (intervalo_anti_rebote_segundos > 0),
    actualizado_por                 BIGINT REFERENCES usuarios (id),
    actualizado_en                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fn_actualizar_fecha()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_colaboradores_actualizado
    BEFORE UPDATE ON colaboradores
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_fecha();

CREATE TRIGGER tg_configuracion_actualizado
    BEFORE UPDATE ON configuracion
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_fecha();

COMMIT;