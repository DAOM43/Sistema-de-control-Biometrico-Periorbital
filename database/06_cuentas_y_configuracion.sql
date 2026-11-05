-- Gestión de cuentas y pantalla de configuración.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
SET ROLE cbp_app;

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
