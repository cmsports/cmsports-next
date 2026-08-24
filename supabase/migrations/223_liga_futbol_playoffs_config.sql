BEGIN;
SELECT _migracion_nueva('223_liga_futbol_playoffs_config');

-- Cuántos equipos clasifican a playoffs desde la tabla general (solo aplica
-- a formato 'liga_playoffs'; en 'grupos_playoffs' lo define la suma de
-- lf_grupos.clasifican) y si se juega partido por el tercer lugar.
ALTER TABLE lf_ligas
  ADD COLUMN cupos_playoffs int NOT NULL DEFAULT 4,
  ADD COLUMN tercer_lugar boolean NOT NULL DEFAULT true;

COMMIT;
