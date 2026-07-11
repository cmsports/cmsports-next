ALTER TABLE grupo_jugadores
ADD COLUMN IF NOT EXISTS orden int NOT NULL DEFAULT 0;

WITH ordenados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY grupo_id
      ORDER BY id
    ) - 1 AS nuevo_orden
  FROM grupo_jugadores
)
UPDATE grupo_jugadores gj
SET orden = ordenados.nuevo_orden
FROM ordenados
WHERE gj.id = ordenados.id;

CREATE INDEX IF NOT EXISTS grupo_jugadores_grupo_orden_idx
ON grupo_jugadores (grupo_id, orden);
