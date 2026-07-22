-- 059_vouchers.sql
CREATE TABLE IF NOT EXISTS vouchers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL DEFAULT '',
  imagen_url TEXT NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

-- Todos los miembros del club ven los vouchers activos
CREATE POLICY "miembros leen vouchers" ON vouchers
  FOR SELECT USING (
    club_id = (SELECT club_id FROM perfiles WHERE id = auth.uid())
  );

-- Admin y profe gestionan vouchers
CREATE POLICY "staff gestiona vouchers" ON vouchers
  FOR ALL USING (
    club_id = (SELECT club_id FROM perfiles WHERE id = auth.uid())
    AND (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('admin', 'superadmin', 'profesor')
  );
