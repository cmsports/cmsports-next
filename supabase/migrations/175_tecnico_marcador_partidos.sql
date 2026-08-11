-- Marcador en vivo del módulo técnico (partidos / scoreboard tablet).
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('175_tecnico_marcador_partidos');

CREATE TABLE tecnico_partidos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  titulo            text NOT NULL DEFAULT 'Partido técnico',
  ronda             text,
  jugador_a_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  jugador_b_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  nombre_a          text NOT NULL,
  nombre_b          text NOT NULL,
  formato           text NOT NULL DEFAULT 'bo5'
    CHECK (formato IN ('bo3', 'bo5', 'bo7')),
  estado            text NOT NULL DEFAULT 'preparacion'
    CHECK (estado IN ('preparacion', 'en_curso', 'pausado', 'finalizado')),
  puntos_a          integer NOT NULL DEFAULT 0 CHECK (puntos_a >= 0),
  puntos_b          integer NOT NULL DEFAULT 0 CHECK (puntos_b >= 0),
  games_a           integer NOT NULL DEFAULT 0 CHECK (games_a >= 0),
  games_b           integer NOT NULL DEFAULT 0 CHECK (games_b >= 0),
  juego_actual      integer NOT NULL DEFAULT 1 CHECK (juego_actual >= 1),
  timer_segundos    integer NOT NULL DEFAULT 0 CHECK (timer_segundos >= 0),
  timer_corriendo   boolean NOT NULL DEFAULT false,
  timer_inicio      timestamptz,
  tarjetas_a        jsonb NOT NULL DEFAULT '{"blanca":false,"amarilla":0,"roja":0}'::jsonb,
  tarjetas_b        jsonb NOT NULL DEFAULT '{"blanca":false,"amarilla":0,"roja":0}'::jsonb,
  challenge_a       integer NOT NULL DEFAULT 0 CHECK (challenge_a >= 0),
  challenge_b       integer NOT NULL DEFAULT 0 CHECK (challenge_b >= 0),
  challenge_max     integer NOT NULL DEFAULT 3 CHECK (challenge_max >= 0),
  ganador_lado      text CHECK (ganador_lado IS NULL OR ganador_lado IN ('a', 'b')),
  notas             text,
  creado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tecnico_partido_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  partido_id   uuid NOT NULL REFERENCES tecnico_partidos(id) ON DELETE CASCADE,
  tipo         text NOT NULL
    CHECK (tipo IN (
      'punto', 'deshacer_punto', 'fin_juego', 'fin_partido',
      'tarjeta', 'challenge', 'pause', 'resume', 'inicio', 'ajuste'
    )),
  lado         text CHECK (lado IS NULL OR lado IN ('a', 'b')),
  detalle      jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tecnico_partidos_club_idx
  ON tecnico_partidos (club_id, creado_en DESC);
CREATE INDEX tecnico_partidos_estado_idx
  ON tecnico_partidos (club_id, estado);
CREATE INDEX tecnico_partido_eventos_partido_idx
  ON tecnico_partido_eventos (partido_id, creado_en DESC);

ALTER TABLE tecnico_partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_partido_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tecnico_partidos_lectura ON tecnico_partidos
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR jugador_a_id = get_my_jugador_id()
      OR jugador_b_id = get_my_jugador_id()
    )
  );

CREATE POLICY tecnico_partidos_staff ON tecnico_partidos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

CREATE POLICY tecnico_partido_eventos_lectura ON tecnico_partido_eventos
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR EXISTS (
        SELECT 1 FROM tecnico_partidos p
        WHERE p.id = partido_id
          AND (p.jugador_a_id = get_my_jugador_id() OR p.jugador_b_id = get_my_jugador_id())
      )
    )
  );

CREATE POLICY tecnico_partido_eventos_staff ON tecnico_partido_eventos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_partidos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_partido_eventos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
