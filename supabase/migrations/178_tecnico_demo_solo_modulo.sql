-- Activa solo el módulo Perfil técnico en Club Demostración TDM.
-- Usar si la 157 falló (p. ej. por tecnico_partidos inexistente) o el módulo
-- nunca quedó en modulos_habilitados. Idempotente.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Requiere: 162_modulo_tecnico_base (tablas base del módulo).

BEGIN;
SELECT _migracion_nueva('178_tecnico_demo_solo_modulo');

UPDATE clubes
SET modulos_habilitados = array_append(
  COALESCE(modulos_habilitados, ARRAY[]::text[]),
  'tecnico'
)
WHERE id = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
  AND NOT ('tecnico' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;
