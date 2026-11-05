SET client_encoding = 'UTF8';
SET ROLE cbp_app;

BEGIN;

INSERT INTO usuarios (nombre_usuario, password_hash, nombre_completo, rol) VALUES
    ('admin',     crypt('Admin2026',     gen_salt('bf', 12)), 'Administrador del Sistema', 'administrador'),
    ('administrativo', crypt('Personal2026', gen_salt('bf', 12)), 'Ana López',            'personal_administrativo'),
    ('recepcion', crypt('Recepcion2026', gen_salt('bf', 12)), 'Recepción',                 'recepcion');

-- umbral: confianza mínima para aceptar una coincidencia; se calibra después con FAR/FRR.
INSERT INTO configuracion (umbral_reconocimiento, horario_corte_turno, intervalo_anti_rebote_segundos, actualizado_por)
VALUES (0.5500, '12:00', 120, (SELECT id FROM usuarios WHERE nombre_usuario = 'admin'));

COMMIT;