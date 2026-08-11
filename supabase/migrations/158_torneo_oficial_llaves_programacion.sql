-- Llaves: índice único playoff + config de programación en campeonato.
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Requiere: migración 156 aplicada.

BEGIN;
SELECT _migracion_nueva('158_torneo_oficial_llaves_programacion');

CREATE UNIQUE INDEX IF NOT EXISTS oficial_partidos_evento_fase_orden_playoff_idx
  ON oficial_partidos (evento_id, fase, orden)
  WHERE fase <> 'grupos';

ALTER TABLE oficial_campeonatos
  ADD COLUMN IF NOT EXISTS mesas_count integer NOT NULL DEFAULT 8
    CHECK (mesas_count BETWEEN 1 AND 64),
  ADD COLUMN IF NOT EXISTS bloque_minutos integer NOT NULL DEFAULT 25
    CHECK (bloque_minutos BETWEEN 10 AND 120),
  ADD COLUMN IF NOT EXISTS hora_inicio time NOT NULL DEFAULT '09:00';

COMMIT;
