-- Permite que "generar semana" se pueda repetir sin duplicar.
--
-- La 074 creó el índice único de (bloque_id, fecha) con una condición:
--   WHERE bloque_id IS NOT NULL
--
-- La intención era no estorbar a las clases creadas a mano, que no tienen
-- bloque. Pero un índice parcial no sirve como destino de un ON CONFLICT, así
-- que el upsert de generar semana fallaba con
--   "there is no unique or exclusion constraint matching the ON CONFLICT"
--
-- La condición además era innecesaria: en PostgreSQL dos NULL no se consideran
-- iguales en un índice único, así que las clases sin bloque nunca iban a chocar
-- entre sí de todos modos.
--
-- Se reemplaza por el índice sin condición.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

DROP INDEX IF EXISTS clases_bloque_fecha_unica;

CREATE UNIQUE INDEX IF NOT EXISTS clases_bloque_fecha_unica
  ON clases (bloque_id, fecha);

COMMIT;


-- ── Verificación: el índice ya no tiene condición ─────────────────────────
SELECT indexname,
       CASE WHEN indexdef LIKE '%WHERE%' THEN 'todavía parcial' ELSE 'listo' END AS estado
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'clases_bloque_fecha_unica';
