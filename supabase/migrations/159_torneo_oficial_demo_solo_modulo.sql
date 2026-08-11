-- Activa solo el módulo torneo_oficial en Club Demostración TDM.
-- Usar si la 157 falló por tecnico_partidos (154 no aplicada): el BEGIN/COMMIT
-- de esa migración revierte también el array_append de torneo_oficial.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('159_torneo_oficial_demo_solo_modulo');

UPDATE clubes
SET modulos_habilitados = array_append(
  COALESCE(modulos_habilitados, ARRAY[]::text[]),
  'torneo_oficial'
)
WHERE id = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
  AND NOT ('torneo_oficial' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;
