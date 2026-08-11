-- Módulo Torneo Oficial (Juez General / ITTF).
-- Tablas propias: no toca torneos internos/externos de club.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('156_modulo_torneo_oficial');

CREATE TABLE oficial_campeonatos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  sede            text,
  zona            text,
  fecha_inicio    date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  fecha_fin       date,
  estado          text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'inscripcion', 'en_curso', 'finalizado', 'archivado')),
  notas           text,
  creado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oficial_eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  campeonato_id     uuid NOT NULL REFERENCES oficial_campeonatos(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  categoria         text NOT NULL,
  genero            text NOT NULL DEFAULT 'mixto'
    CHECK (genero IN ('varones', 'damas', 'mixto')),
  formato_partido   text NOT NULL DEFAULT 'bo5'
    CHECK (formato_partido IN ('bo3', 'bo5', 'bo7')),
  fase              text NOT NULL DEFAULT 'inscripcion'
    CHECK (fase IN ('inscripcion', 'grupos', 'llaves', 'finalizado')),
  clasifican_por_grupo integer NOT NULL DEFAULT 2
    CHECK (clasifican_por_grupo BETWEEN 1 AND 4),
  estado            text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'en_curso', 'finalizado', 'archivado')),
  campeon_inscrito_id uuid,
  subcampeon_inscrito_id uuid,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oficial_inscritos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  evento_id           uuid NOT NULL REFERENCES oficial_eventos(id) ON DELETE CASCADE,
  jugador_id          uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  nombre              text NOT NULL,
  asociacion          text,
  codigo_federativo   text,
  genero              text CHECK (genero IS NULL OR genero IN ('V', 'D')),
  ranking             integer,
  cabeza_numero       integer CHECK (cabeza_numero IS NULL OR cabeza_numero BETWEEN 1 AND 64),
  orden_inscripcion   integer NOT NULL DEFAULT 0,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, nombre, asociacion)
);

ALTER TABLE oficial_eventos
  ADD CONSTRAINT oficial_eventos_campeon_fkey
  FOREIGN KEY (campeon_inscrito_id) REFERENCES oficial_inscritos(id) ON DELETE SET NULL;
ALTER TABLE oficial_eventos
  ADD CONSTRAINT oficial_eventos_subcampeon_fkey
  FOREIGN KEY (subcampeon_inscrito_id) REFERENCES oficial_inscritos(id) ON DELETE SET NULL;

CREATE TABLE oficial_grupos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  evento_id   uuid NOT NULL REFERENCES oficial_eventos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  orden       integer NOT NULL DEFAULT 0,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, nombre)
);

CREATE TABLE oficial_grupo_inscritos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  grupo_id      uuid NOT NULL REFERENCES oficial_grupos(id) ON DELETE CASCADE,
  inscrito_id   uuid NOT NULL REFERENCES oficial_inscritos(id) ON DELETE CASCADE,
  orden         integer NOT NULL DEFAULT 0,
  UNIQUE (grupo_id, inscrito_id)
);

CREATE TABLE oficial_partidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  evento_id       uuid NOT NULL REFERENCES oficial_eventos(id) ON DELETE CASCADE,
  grupo_id        uuid REFERENCES oficial_grupos(id) ON DELETE CASCADE,
  fase            text NOT NULL DEFAULT 'grupos',
  orden           integer NOT NULL DEFAULT 0,
  inscrito_a_id   uuid REFERENCES oficial_inscritos(id) ON DELETE SET NULL,
  inscrito_b_id   uuid REFERENCES oficial_inscritos(id) ON DELETE SET NULL,
  ganador_id      uuid REFERENCES oficial_inscritos(id) ON DELETE SET NULL,
  sets            jsonb NOT NULL DEFAULT '[]'::jsonb,
  es_walkover     boolean NOT NULL DEFAULT false,
  mesa            integer CHECK (mesa IS NULL OR mesa > 0),
  programado_en   timestamptz,
  slot_a_grupo_id uuid REFERENCES oficial_grupos(id) ON DELETE SET NULL,
  slot_a_posicion integer CHECK (slot_a_posicion IS NULL OR slot_a_posicion BETWEEN 1 AND 4),
  slot_b_grupo_id uuid REFERENCES oficial_grupos(id) ON DELETE SET NULL,
  slot_b_posicion integer CHECK (slot_b_posicion IS NULL OR slot_b_posicion BETWEEN 1 AND 4),
  marcador_id     uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CHECK (inscrito_a_id IS NULL OR inscrito_b_id IS NULL OR inscrito_a_id <> inscrito_b_id),
  CHECK (
    ganador_id IS NULL
    OR ganador_id = inscrito_a_id
    OR ganador_id = inscrito_b_id
  )
);

CREATE INDEX oficial_campeonatos_club_idx ON oficial_campeonatos (club_id, creado_en DESC);
CREATE INDEX oficial_eventos_campeonato_idx ON oficial_eventos (campeonato_id, categoria, genero);
CREATE INDEX oficial_inscritos_evento_idx ON oficial_inscritos (evento_id, orden_inscripcion);
CREATE INDEX oficial_grupos_evento_idx ON oficial_grupos (evento_id, orden);
CREATE INDEX oficial_grupo_inscritos_grupo_idx ON oficial_grupo_inscritos (grupo_id, orden);
CREATE INDEX oficial_partidos_evento_idx ON oficial_partidos (evento_id, fase, orden);
CREATE INDEX oficial_partidos_grupo_idx ON oficial_partidos (grupo_id) WHERE grupo_id IS NOT NULL;

ALTER TABLE oficial_campeonatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficial_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficial_inscritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficial_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficial_grupo_inscritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficial_partidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY oficial_campeonatos_staff ON oficial_campeonatos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY oficial_eventos_staff ON oficial_eventos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY oficial_inscritos_staff ON oficial_inscritos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY oficial_grupos_staff ON oficial_grupos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY oficial_grupo_inscritos_staff ON oficial_grupo_inscritos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY oficial_partidos_staff ON oficial_partidos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_campeonatos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_eventos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_inscritos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_grupos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_grupo_inscritos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_partidos; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
