BEGIN;
SELECT _migracion_nueva('224_liga_futbol_reglamento');

ALTER TABLE lf_ligas ADD COLUMN reglamento text;

COMMIT;
