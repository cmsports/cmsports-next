-- Sorteo, lados de mesa y saque inicial del marcador técnico.
-- Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('177_marcador_sorteo_lados');

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS sorteo jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS sorteo_completo boolean NOT NULL DEFAULT false;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS lado_mesa_a text NOT NULL DEFAULT 'izquierda';

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS lado_mesa_b text NOT NULL DEFAULT 'derecha';

DO $$
BEGIN
  ALTER TABLE tecnico_partidos
    ADD CONSTRAINT tecnico_partidos_lado_mesa_a_chk
    CHECK (lado_mesa_a IN ('izquierda', 'derecha'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE tecnico_partidos
    ADD CONSTRAINT tecnico_partidos_lado_mesa_b_chk
    CHECK (lado_mesa_b IN ('izquierda', 'derecha'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS saque_inicial_lado text;

ALTER TABLE tecnico_partidos
  ADD COLUMN IF NOT EXISTS cambio_lado_deciding_hecho boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  ALTER TABLE tecnico_partido_eventos DROP CONSTRAINT IF EXISTS tecnico_partido_eventos_tipo_check;
  ALTER TABLE tecnico_partido_eventos ADD CONSTRAINT tecnico_partido_eventos_tipo_check
    CHECK (tipo IN (
      'punto', 'deshacer_punto', 'fin_juego', 'fin_partido',
      'tarjeta', 'challenge', 'pause', 'resume', 'inicio', 'ajuste',
      'cambio_lado', 'sorteo'
    ));
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMIT;
