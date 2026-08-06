BEGIN;
SELECT _migracion_nueva('130_notas_superadmin');

-- Notas rápidas entre superadmins. Cualquiera sube, cualquiera borra.
-- No es un chat: son post-its que se pegan y se tiran.
CREATE TABLE notas_superadmin (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto      text NOT NULL CHECK (length(trim(texto)) > 0),
  autor      text NOT NULL CHECK (autor IN ('luis', 'benjamin')),
  creada_en  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notas_superadmin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notas_solo_superadmin ON notas_superadmin;
CREATE POLICY notas_solo_superadmin ON notas_superadmin
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');

COMMIT;
