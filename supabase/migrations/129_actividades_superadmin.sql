BEGIN;
SELECT _migracion_nueva('129_actividades_superadmin');

-- Calendario privado de los superadmin: reuniones, actividades, recordatorios
CREATE TABLE actividades_superadmin (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         text NOT NULL CHECK (length(trim(titulo)) > 0),
  nota           text,
  fecha          date NOT NULL,
  hora           time,
  completada     boolean NOT NULL DEFAULT false,
  creada_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE actividades_superadmin ENABLE ROW LEVEL SECURITY;

CREATE POLICY actividades_solo_superadmin ON actividades_superadmin
  FOR ALL USING (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');

CREATE INDEX actividades_superadmin_fecha_idx ON actividades_superadmin(fecha);

COMMIT;
