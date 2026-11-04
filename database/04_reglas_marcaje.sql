-- Reglas de negocio del marcaje: secuencia entrada -> salida, horario oficial y modo de pruebas.
-- Ejecutar una sola vez sobre la base control_biometrico existente.
SET ROLE cbp_app;

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