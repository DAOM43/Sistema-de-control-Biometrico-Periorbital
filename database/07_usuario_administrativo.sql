-- Usuario fijo por puesto: la cuenta de personal administrativo deja de llevar el nombre de una persona.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
SET ROLE cbp_app;

BEGIN;

UPDATE usuarios SET nombre_usuario = 'administrativo' WHERE nombre_usuario = 'alopez';

COMMIT;
