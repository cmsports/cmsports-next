BEGIN;
SELECT _migracion_nueva('128_tareas_avance_asignacion');

-- Agrega porcentaje de avance y asignación a tareas superadmin
ALTER TABLE tareas
  ADD COLUMN porcentaje smallint NOT NULL DEFAULT 0
    CHECK (porcentaje BETWEEN 0 AND 100),
  ADD COLUMN asignado_a text
    CHECK (asignado_a IN ('luis', 'benjamin'));

COMMIT;
