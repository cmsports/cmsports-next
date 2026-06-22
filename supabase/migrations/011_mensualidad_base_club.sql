-- ============================================================
-- CmSports — Mensualidad base configurable por club
-- ============================================================
ALTER TABLE clubes ADD COLUMN IF NOT EXISTS mensualidad_base numeric DEFAULT 25000;
