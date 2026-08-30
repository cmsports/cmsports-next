BEGIN;
SELECT _migracion_nueva('222_liga_futbol_sanciones_config');

-- Reglas de sanción automática por tarjetas, configurables por liga.
ALTER TABLE lf_ligas
  ADD COLUMN fechas_suspension_roja int NOT NULL DEFAULT 1,
  ADD COLUMN amarillas_acumulacion_suspension int NOT NULL DEFAULT 5,
  ADD COLUMN amarillas_acumulacion_fechas int NOT NULL DEFAULT 1;

COMMIT;
