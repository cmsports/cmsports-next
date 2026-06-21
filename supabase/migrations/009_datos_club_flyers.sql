-- ============================================================
-- CmSports — Datos fijos del club para flyers (dirección, teléfono)
-- ============================================================
ALTER TABLE clubes ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE clubes ADD COLUMN IF NOT EXISTS telefono text;
