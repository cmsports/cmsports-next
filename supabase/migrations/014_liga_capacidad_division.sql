-- ============================================================
-- CmSports — Cupo máximo por división de liga
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--
-- Anexo B: el formulario de creación de liga pide "jugadores por
-- división"; este valor se guarda por división (null = sin límite,
-- para compatibilidad con divisiones creadas antes de este cambio).
-- ============================================================

ALTER TABLE liga_divisiones ADD COLUMN IF NOT EXISTS capacidad_max int;
