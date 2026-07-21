-- Migración 055: Torneos Internos + Ranking
ALTER TABLE torneos
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'externo';

ALTER TABLE torneos
  DROP CONSTRAINT IF EXISTS torneos_tipo_check;
ALTER TABLE torneos
  ADD CONSTRAINT torneos_tipo_check CHECK (tipo IN ('interno', 'externo'));

-- Backfill: todos los torneos existentes son externos
UPDATE torneos SET tipo = 'externo' WHERE tipo IS NULL;

-- Timestamp de último reinicio de ranking por club
ALTER TABLE clubes
  ADD COLUMN IF NOT EXISTS ranking_reiniciado_en timestamptz;
