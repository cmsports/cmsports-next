ALTER TABLE movimientos
ADD COLUMN IF NOT EXISTS torneo_id uuid REFERENCES torneos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movimientos_torneo_id_idx
ON movimientos (torneo_id);
