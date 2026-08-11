-- Planes de entrenamiento, ejercicios y contexto de sesiones técnicas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('168_planes_y_contexto_sesiones_tecnicas');

CREATE TABLE tecnico_planes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  descripcion     text,
  nivel           text,
  objetivo_general text,
  duracion_min    integer CHECK (duracion_min IS NULL OR duracion_min > 0),
  activo          boolean NOT NULL DEFAULT true,
  creado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_plan_ejercicios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES tecnico_planes(id) ON DELETE CASCADE,
  objetivo_id     uuid REFERENCES tecnico_objetivos(id) ON DELETE SET NULL,
  orden           smallint NOT NULL CHECK (orden > 0),
  nombre          text NOT NULL,
  descripcion     text,
  duracion_min    integer CHECK (duracion_min IS NULL OR duracion_min > 0),
  repeticiones    integer CHECK (repeticiones IS NULL OR repeticiones > 0),
  dificultad      text,
  criterio_exito  text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, orden)
);

CREATE TABLE tecnico_plan_jugadores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES tecnico_planes(id) ON DELETE CASCADE,
  jugador_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'asignado'
    CHECK (estado IN ('asignado', 'en_curso', 'completado', 'pausado', 'archivado')),
  fecha_inicio    date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  fecha_fin       date,
  notas           text,
  asignado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tecnico_sesiones
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES tecnico_planes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ejercicio_id uuid REFERENCES tecnico_plan_ejercicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rival_nombre text,
  ADD COLUMN IF NOT EXISTS competencia_nombre text,
  ADD COLUMN IF NOT EXISTS marcador text,
  ADD COLUMN IF NOT EXISTS sets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS es_muestra_completa boolean NOT NULL DEFAULT false;

CREATE INDEX tecnico_planes_club_idx
  ON tecnico_planes (club_id, activo, nombre);
CREATE INDEX tecnico_plan_ejercicios_plan_idx
  ON tecnico_plan_ejercicios (club_id, plan_id, orden);
CREATE INDEX tecnico_plan_jugadores_jugador_idx
  ON tecnico_plan_jugadores (club_id, jugador_id, estado);
CREATE INDEX tecnico_sesiones_plan_idx
  ON tecnico_sesiones (club_id, plan_id, ejercicio_id);
CREATE INDEX tecnico_sesiones_tipo_idx
  ON tecnico_sesiones (club_id, tipo, fecha DESC);

ALTER TABLE tecnico_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_plan_ejercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_plan_jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tecnico_planes_staff ON tecnico_planes
  FOR ALL USING (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );

CREATE POLICY tecnico_plan_ejercicios_staff ON tecnico_plan_ejercicios
  FOR ALL USING (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );

CREATE POLICY tecnico_plan_jugadores_lectura ON tecnico_plan_jugadores
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR jugador_id = get_my_jugador_id()
    )
  );

CREATE POLICY tecnico_plan_jugadores_staff ON tecnico_plan_jugadores
  FOR ALL USING (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );

COMMIT;
