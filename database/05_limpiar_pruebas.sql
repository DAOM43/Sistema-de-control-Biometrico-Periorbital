-- Elimina las marcaciones de prueba antes de pasar a producción.
-- Las salidas se eliminan primero para respetar la regla de secuencia.
SET ROLE cbp_app;

BEGIN;

DELETE FROM registros_contingencia
WHERE marcacion_id IN (SELECT id FROM marcaciones WHERE es_prueba);

DELETE FROM marcaciones WHERE es_prueba AND tipo = 'salida';
DELETE FROM marcaciones WHERE es_prueba AND tipo = 'entrada';

-- Intentos rechazados durante las pruebas; la bitácora de producción empieza vacía.
DELETE FROM intentos_no_reconocidos;

UPDATE configuracion SET modo_pruebas = FALSE;

COMMIT;