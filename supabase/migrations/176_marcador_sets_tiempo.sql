-- Marcador técnico: historial de sets + configuración de tiempo.
-- Ejecutar a mano en SQL Editor si aún no está 157_torneo_oficial_demo_y_sets_marcador.
-- Idempotente (IF NOT EXISTS).

BEGIN;
SELECT _migracion_nueva('176_marcador_sets_tiempo');

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS historial_sets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS timer_modo text NOT NULL DEFAULT 'cronometro';

DO $$
BEGIN
  ALTER TABLE tecnico_partidos
    ADD CONSTRAINT tecnico_partidos_timer_modo_chk
    CHECK (timer_modo IN ('cronometro', 'cuenta_atras'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS timer_limite_segundos integer
    CHECK (timer_limite_segundos IS NULL OR timer_limite_segundos > 0);

COMMIT;
