SET client_encoding = 'UTF8';

-- Instalación completa de la base para el ambiente de demostración en Neon (PostgreSQL en la nube).
-- Ejecutar una sola vez en el SQL Editor de Neon, sobre la base vacía.
-- Reúne los scripts 01 a 08, sin el cambio de rol que solo se usa en la instalación local.

-- ===== 01_esquema.sql =====
-- Estructura de almacenamiento 
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

-- ===== 02_intentos_no_reconocidos.sql =====
-- Tabla complementaria para RF-06. No almacena imagen, solo el resultado de la comparación.
BEGIN;

CREATE TABLE intentos_no_reconocidos (
    id                    BIGSERIAL PRIMARY KEY,
    fecha_hora            TIMESTAMP   NOT NULL DEFAULT now(),
    motivo                VARCHAR(20) NOT NULL CHECK (motivo IN ('no_reconocido', 'no_enrolado')),
    colaborador_cercano   BIGINT REFERENCES colaboradores (id) ON DELETE SET NULL,
    puntaje               NUMERIC(5,4) CHECK (puntaje BETWEEN 0 AND 1),
    revisado              BOOLEAN     NOT NULL DEFAULT FALSE,
    revisado_por          BIGINT REFERENCES usuarios (id)
);

CREATE INDEX ix_intentos_fecha ON intentos_no_reconocidos (fecha_hora);

COMMIT;

-- ===== 03_datos_iniciales.sql =====
BEGIN;

INSERT INTO usuarios (nombre_usuario, password_hash, nombre_completo, rol) VALUES
    ('admin',     crypt('Admin2026',     gen_salt('bf', 12)), 'Administrador del Sistema', 'administrador'),
    ('administrativo', crypt('Personal2026', gen_salt('bf', 12)), 'Ana López',            'personal_administrativo'),
    ('recepcion', crypt('Recepcion2026', gen_salt('bf', 12)), 'Recepción',                 'recepcion');

-- umbral: confianza mínima para aceptar una coincidencia; se calibra después con FAR/FRR.
INSERT INTO configuracion (umbral_reconocimiento, horario_corte_turno, intervalo_anti_rebote_segundos, actualizado_por)
VALUES (0.5500, '12:00', 120, (SELECT id FROM usuarios WHERE nombre_usuario = 'admin'));

COMMIT;

-- ===== 04_reglas_marcaje.sql =====
-- Reglas de negocio del marcaje: secuencia entrada -> salida, horario oficial y modo de pruebas.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
BEGIN;

-- 1. Horario oficial y modo de pruebas en la configuración.
ALTER TABLE configuracion
    ADD COLUMN hora_entrada_oficial      TIME       NOT NULL DEFAULT '07:00',
    ADD COLUMN hora_salida_oficial       TIME       NOT NULL DEFAULT '16:30',
    ADD COLUMN tolerancia_entrada_min    SMALLINT   NOT NULL DEFAULT 5
                                         CHECK (tolerancia_entrada_min BETWEEN 0 AND 60),
    ADD COLUMN dias_laborales            SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
    ADD COLUMN modo_pruebas              BOOLEAN    NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT ck_configuracion_horario CHECK (hora_entrada_oficial < hora_salida_oficial),
    ADD CONSTRAINT ck_configuracion_dias CHECK (dias_laborales <@ '{1,2,3,4,5,6,7}'::SMALLINT[]);

-- La regla secuencial sustituye al corte de turno.
ALTER TABLE configuracion DROP COLUMN horario_corte_turno;

-- 2. Identificación de marcaciones hechas en modo de pruebas.
ALTER TABLE marcaciones ADD COLUMN es_prueba BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE marcaciones SET es_prueba = TRUE;

-- 3. Corrección de los registros existentes: el primero de cada día pasa a entrada y el resto a salida.
WITH ordenadas AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY colaborador_id, fecha ORDER BY hora, id) AS orden
    FROM marcaciones
)
UPDATE marcaciones m
SET tipo = CASE WHEN o.orden = 1 THEN 'entrada' ELSE 'salida' END
FROM ordenadas o
WHERE o.id = m.id;

-- 4. Una sola entrada por colaborador y día, garantizada por el motor.
CREATE UNIQUE INDEX ux_marcaciones_entrada_diaria
    ON marcaciones (colaborador_id, fecha)
    WHERE tipo = 'entrada';

-- 5. Validación de la secuencia a nivel de base de datos.
CREATE OR REPLACE FUNCTION fn_validar_secuencia_marcacion()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.tipo = 'entrada' AND EXISTS (
            SELECT 1 FROM marcaciones
            WHERE colaborador_id = OLD.colaborador_id AND fecha = OLD.fecha AND tipo = 'salida'
        ) THEN
            RAISE EXCEPTION 'No se puede eliminar una entrada que tiene salidas registradas.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (NEW.colaborador_id, NEW.fecha, NEW.hora, NEW.tipo)
                        IS DISTINCT FROM (OLD.colaborador_id, OLD.fecha, OLD.hora, OLD.tipo) THEN
        RAISE EXCEPTION 'Las marcaciones registradas no pueden modificarse.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.tipo = 'salida' AND NOT EXISTS (
        SELECT 1 FROM marcaciones
        WHERE colaborador_id = NEW.colaborador_id
          AND fecha = NEW.fecha
          AND tipo = 'entrada'
          AND hora <= NEW.hora
    ) THEN
        RAISE EXCEPTION 'No existe una entrada previa para registrar la salida del % a las %.',
            NEW.fecha, NEW.hora
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_marcaciones_secuencia
    BEFORE INSERT OR UPDATE OR DELETE ON marcaciones
    FOR EACH ROW EXECUTE FUNCTION fn_validar_secuencia_marcacion();

COMMIT;

-- ===== 06_cuentas_y_configuracion.sql =====
-- Gestión de cuentas y pantalla de configuración.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
BEGIN;

-- Obliga a cambiar la contraseña después de un restablecimiento hecho por el administrador.
ALTER TABLE usuarios
    ADD COLUMN debe_cambiar_password  BOOLEAN   NOT NULL DEFAULT FALSE,
    ADD COLUMN password_actualizado_en TIMESTAMP NOT NULL DEFAULT now();

-- Límites que también valida la API, para que ningún valor fuera de rango llegue por otra vía.
UPDATE configuracion SET intervalo_anti_rebote_segundos = 5 WHERE intervalo_anti_rebote_segundos < 5;

ALTER TABLE configuracion
    ADD CONSTRAINT ck_configuracion_umbral_operativo
        CHECK (umbral_reconocimiento BETWEEN 0.40 AND 0.95),
    ADD CONSTRAINT ck_configuracion_anti_rebote
        CHECK (intervalo_anti_rebote_segundos BETWEEN 5 AND 3600),
    ADD CONSTRAINT ck_configuracion_dias_minimo
        CHECK (cardinality(dias_laborales) >= 1);

COMMIT;

-- ===== 07_usuario_administrativo.sql =====
-- Usuario fijo por puesto: la cuenta de personal administrativo deja de llevar el nombre de una persona.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
BEGIN;

UPDATE usuarios SET nombre_usuario = 'administrativo' WHERE nombre_usuario = 'alopez';

COMMIT;

-- ===== 08_evaluacion_guardada.sql =====
-- La evaluación de horario se guarda al registrar la marcación, para que un cambio posterior
-- en la configuración no altere los reportes de fechas anteriores.
-- Ejecutar una sola vez y después correr backend\scripts\guardar_evaluaciones.py.
BEGIN;

ALTER TABLE marcaciones
    ADD COLUMN observacion_horario  TEXT,
    ADD COLUMN en_horario           BOOLEAN,
    ADD COLUMN minutos_horario      INTEGER;

COMMIT;

-- ===== Zona horaria de la base =====
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Guatemala');
END $$;
