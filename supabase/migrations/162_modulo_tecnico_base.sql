-- Módulo técnico: base de sesiones, videos, eventos y evaluaciones.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Esta migración no borra datos. El portazo evita ejecutarla dos veces.

BEGIN;
SELECT _migracion_nueva('162_modulo_tecnico_base');

CREATE TABLE tecnico_objetivos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  codigo      text NOT NULL,
  nombre      text NOT NULL,
  descripcion text,
  dimension   text NOT NULL DEFAULT 'general',
  nivel       text,
  criterio    text,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, codigo)
);

CREATE TABLE tecnico_jugador_objetivos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id   uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  objetivo_id  uuid NOT NULL REFERENCES tecnico_objetivos(id) ON DELETE CASCADE,
  estado       text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_progreso', 'logrado', 'archivado')),
  fecha_inicio date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  fecha_cierre date,
  notas        text,
  creado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  profesor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titulo          text NOT NULL,
  tipo            text NOT NULL DEFAULT 'analisis_video'
    CHECK (tipo IN ('analisis_video', 'entrenamiento', 'competencia', 'evaluacion')),
  estado          text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'en_revision', 'publicada', 'archivada')),
  fecha           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  notas           text,
  publicada_en    timestamptz,
  publicada_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  sesion_id     uuid NOT NULL REFERENCES tecnico_sesiones(id) ON DELETE CASCADE,
  jugador_id    uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  archivo_path  text NOT NULL UNIQUE,
  nombre        text NOT NULL,
  mime_type     text NOT NULL,
  tamano_bytes  bigint NOT NULL CHECK (tamano_bytes > 0),
  duracion_ms   integer CHECK (duracion_ms IS NULL OR duracion_ms >= 0),
  estado        text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'archivado', 'eliminado')),
  creado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  sesion_id       uuid NOT NULL REFERENCES tecnico_sesiones(id) ON DELETE CASCADE,
  video_id        uuid REFERENCES tecnico_videos(id) ON DELETE SET NULL,
  jugador_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  timestamp_ms    integer NOT NULL CHECK (timestamp_ms >= 0),
  golpe_codigo    text NOT NULL,
  zona_mesa       smallint CHECK (zona_mesa IS NULL OR zona_mesa BETWEEN 1 AND 9),
  resultado       text NOT NULL DEFAULT 'en_juego'
    CHECK (resultado IN ('punto_ganado', 'punto_perdido', 'en_juego')),
  fase            text,
  notas           text,
  metadatos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_evaluaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  sesion_id     uuid NOT NULL REFERENCES tecnico_sesiones(id) ON DELETE CASCADE,
  jugador_id     uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  evaluador_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado        text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'publicada', 'archivada')),
  resumen       text,
  publicada_en  timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_evaluacion_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluacion_id  uuid NOT NULL REFERENCES tecnico_evaluaciones(id) ON DELETE CASCADE,
  objetivo_id    uuid REFERENCES tecnico_objetivos(id) ON DELETE SET NULL,
  codigo         text NOT NULL,
  nombre         text NOT NULL,
  valor          numeric(5,2),
  estado         text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('no_logrado', 'en_progreso', 'logrado', 'pendiente')),
  comentario     text
);

CREATE INDEX tecnico_objetivos_club_idx
  ON tecnico_objetivos (club_id, activo, dimension);
CREATE INDEX tecnico_jugador_objetivos_jugador_idx
  ON tecnico_jugador_objetivos (club_id, jugador_id, estado);
CREATE INDEX tecnico_sesiones_jugador_idx
  ON tecnico_sesiones (club_id, jugador_id, fecha DESC);
CREATE INDEX tecnico_videos_sesion_idx
  ON tecnico_videos (club_id, sesion_id);
CREATE INDEX tecnico_eventos_sesion_tiempo_idx
  ON tecnico_eventos (club_id, sesion_id, timestamp_ms);
CREATE INDEX tecnico_evaluaciones_jugador_idx
  ON tecnico_evaluaciones (club_id, jugador_id, creado_en DESC);

ALTER TABLE tecnico_objetivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_jugador_objetivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_evaluacion_items ENABLE ROW LEVEL SECURITY;

-- El staff administra el módulo; el jugador solo ve sesiones/evaluaciones publicadas.
CREATE POLICY tecnico_objetivos_staff ON tecnico_objetivos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_jugador_objetivos_lectura ON tecnico_jugador_objetivos
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (get_my_rol() IN ('admin', 'superadmin', 'profesor') OR jugador_id = get_my_jugador_id())
  );
CREATE POLICY tecnico_jugador_objetivos_staff ON tecnico_jugador_objetivos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_sesiones_lectura ON tecnico_sesiones
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR (jugador_id = get_my_jugador_id() AND estado = 'publicada')
    )
  );
CREATE POLICY tecnico_sesiones_staff ON tecnico_sesiones
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_videos_lectura ON tecnico_videos
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR (jugador_id = get_my_jugador_id()
          AND EXISTS (
            SELECT 1 FROM tecnico_sesiones s
            WHERE s.id = sesion_id AND s.estado = 'publicada'
          ))
    )
  );
CREATE POLICY tecnico_videos_staff ON tecnico_videos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_eventos_lectura ON tecnico_eventos
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR (jugador_id = get_my_jugador_id()
          AND EXISTS (
            SELECT 1 FROM tecnico_sesiones s
            WHERE s.id = sesion_id AND s.estado = 'publicada'
          ))
    )
  );
CREATE POLICY tecnico_eventos_staff ON tecnico_eventos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_evaluaciones_lectura ON tecnico_evaluaciones
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR (jugador_id = get_my_jugador_id() AND estado = 'publicada')
    )
  );
CREATE POLICY tecnico_evaluaciones_staff ON tecnico_evaluaciones
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_evaluacion_items_lectura ON tecnico_evaluacion_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tecnico_evaluaciones e
      WHERE e.id = evaluacion_id
        AND e.club_id = get_my_club_id()
        AND (
          get_my_rol() IN ('admin', 'superadmin', 'profesor')
          OR (e.jugador_id = get_my_jugador_id() AND e.estado = 'publicada')
        )
    )
  );
CREATE POLICY tecnico_evaluacion_items_staff ON tecnico_evaluacion_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tecnico_evaluaciones e
      WHERE e.id = evaluacion_id
        AND e.club_id = get_my_club_id()
        AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tecnico_evaluaciones e
      WHERE e.id = evaluacion_id
        AND e.club_id = get_my_club_id()
        AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
    )
  );

-- Bucket privado: las URLs se entregarán después mediante Server Actions verificadas.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tecnico-videos', 'tecnico-videos', false, 524288000)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY tecnico_videos_storage_staff ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'tecnico-videos'
    AND (storage.foldername(name))[1] = 'videos'
    AND (storage.foldername(name))[2] = get_my_club_id()::text
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    bucket_id = 'tecnico-videos'
    AND (storage.foldername(name))[1] = 'videos'
    AND (storage.foldername(name))[2] = get_my_club_id()::text
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );

COMMIT;
