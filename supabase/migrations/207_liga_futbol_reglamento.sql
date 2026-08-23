BEGIN;
SELECT _migracion_nueva('207_liga_futbol_reglamento');

ALTER TABLE lf_ligas ADD COLUMN reglamento text;

COMMIT;
