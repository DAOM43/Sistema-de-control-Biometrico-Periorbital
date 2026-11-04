-- Tabla complementaria para RF-06. No almacena imagen, solo el resultado de la comparación.
SET ROLE cbp_app;

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