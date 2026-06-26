-- ============================================================
-- CmSports — Cabezas de serie principales (1° y 2°) por torneo
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--
-- Permite marcar manualmente quién es el cabeza de serie 1° y 2°
-- de un torneo (independiente del ELO, útil cuando recién hay poca
-- data). Se usan al generar las llaves para que esos dos jugadores
-- queden en lados opuestos del cuadro y solo puedan enfrentarse en
-- la final.
-- ============================================================

ALTER TABLE torneos ADD COLUMN IF NOT EXISTS cabeza_serie_1 uuid REFERENCES jugadores(id) ON DELETE SET NULL;
ALTER TABLE torneos ADD COLUMN IF NOT EXISTS cabeza_serie_2 uuid REFERENCES jugadores(id) ON DELETE SET NULL;
