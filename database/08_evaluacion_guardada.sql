-- La evaluación de horario se guarda al registrar la marcación, para que un cambio posterior
-- en la configuración no altere los reportes de fechas anteriores.
-- Ejecutar una sola vez y después correr backend\scripts\guardar_evaluaciones.py.
SET ROLE cbp_app;

BEGIN;

ALTER TABLE marcaciones
    ADD COLUMN observacion_horario  TEXT,
    ADD COLUMN en_horario           BOOLEAN,
    ADD COLUMN minutos_horario      INTEGER;

COMMIT;
