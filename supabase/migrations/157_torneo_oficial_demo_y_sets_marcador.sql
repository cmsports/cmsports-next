-- Habilita Torneo oficial en Club Demostración TDM.
-- También agrega historial_sets al marcador técnico (sync con torneo oficial).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Requiere: migración 156 ya aplicada y 154 (marcador técnico) si usas marcador en vivo.

BEGIN;
SELECT _migracion_nueva('157_torneo_oficial_demo_y_sets_marcador');

UPDATE clubes
SET modulos_habilitados = array_append(modulos_habilitados, 'torneo_oficial')
WHERE id = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
  AND NOT ('torneo_oficial' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

UPDATE clubes
SET modulos_habilitados = array_append(modulos_habilitados, 'tecnico')
WHERE id = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
  AND NOT ('tecnico' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS historial_sets jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
