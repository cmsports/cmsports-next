-- ============================================================
-- CmSports — Referencia de flyer predeterminada
-- ============================================================
ALTER TABLE flyer_referencias ADD COLUMN IF NOT EXISTS predeterminada boolean NOT NULL DEFAULT false;
