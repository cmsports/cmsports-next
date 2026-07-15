-- Retira definitivamente el sistema de puntuación individual anterior.
DROP TABLE IF EXISTS historial_elo CASCADE;

ALTER TABLE jugadores
  DROP COLUMN IF EXISTS elo;

ALTER TABLE partidos
  DROP COLUMN IF EXISTS elo_cambio_a,
  DROP COLUMN IF EXISTS elo_cambio_b;

ALTER TABLE torneos_externos
  DROP COLUMN IF EXISTS puntos_elo;

UPDATE clubes
SET modulos_habilitados = array_remove(modulos_habilitados, 'elo')
WHERE modulos_habilitados @> ARRAY['elo']::text[];
