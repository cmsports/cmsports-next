BEGIN;
SELECT _migracion_nueva('197_liga_futbol_base');

-- ═══════════════════════════════════════════════════════════════════════
-- Módulo Liga Fútbol — tablas base
-- Prefijo lf_ para no colisionar con liga_* (TDM)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Ligas
CREATE TABLE lf_ligas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  deporte_variante text NOT NULL DEFAULT 'futbol_7',
  categoria       text NOT NULL DEFAULT 'todo_competidor',
  formato         text NOT NULL DEFAULT 'todos_vs_todos'
                  CHECK (formato IN ('todos_vs_todos','grupos_playoffs','liga_playoffs')),
  max_equipos     int NOT NULL DEFAULT 12,
  ruedas          int NOT NULL DEFAULT 1,
  dia_juego       text,
  horarios        text[] DEFAULT '{}',
  cancha          text,
  direccion_cancha text,
  monto_inscripcion int NOT NULL DEFAULT 0,
  fecha_inicio    date,
  fecha_fin       date,
  estado          text NOT NULL DEFAULT 'inscripcion'
                  CHECK (estado IN ('inscripcion','en_curso','playoffs','finalizada','cancelada')),
  puntos_victoria int NOT NULL DEFAULT 3,
  puntos_empate   int NOT NULL DEFAULT 1,
  puntos_derrota  int NOT NULL DEFAULT 0,
  puntos_wo_perdedor int NOT NULL DEFAULT 0,
  goles_wo_favor  int NOT NULL DEFAULT 3,
  goles_wo_contra int NOT NULL DEFAULT 0,
  codigo_publico  text UNIQUE,
  es_publica      boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_ligas_club ON lf_ligas(club_id);

-- 2. Grupos (solo para formato grupos_playoffs)
CREATE TABLE lf_grupos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id     uuid NOT NULL REFERENCES lf_ligas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  orden       int NOT NULL DEFAULT 0,
  clasifican  int NOT NULL DEFAULT 2
);
CREATE INDEX idx_lf_grupos_liga ON lf_grupos(liga_id);

-- 3. Equipos
CREATE TABLE lf_equipos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id             uuid NOT NULL REFERENCES lf_ligas(id) ON DELETE CASCADE,
  grupo_id            uuid REFERENCES lf_grupos(id) ON DELETE SET NULL,
  nombre              text NOT NULL,
  logo_url            text,
  color_principal     text,
  color_secundario    text,
  delegado_nombre     text,
  delegado_telefono   text,
  delegado_email      text,
  estado_inscripcion  text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_inscripcion IN ('pendiente','abonado','pagado')),
  monto_pagado        int NOT NULL DEFAULT 0,
  observaciones       text,
  creado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_equipos_liga ON lf_equipos(liga_id);
CREATE INDEX idx_lf_equipos_grupo ON lf_equipos(grupo_id);

-- 4. Jugadores de equipo
CREATE TABLE lf_jugadores (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id               uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  nombre                  text NOT NULL,
  rut                     text,
  numero                  int,
  posicion                text,
  fecha_nacimiento        date,
  foto_url                text,
  estado                  text NOT NULL DEFAULT 'activo'
                          CHECK (estado IN ('activo','suspendido','retirado')),
  sancionado_hasta_fecha_id uuid,
  creado_en               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_jugadores_equipo ON lf_jugadores(equipo_id);

-- 5. Fechas (jornadas regulares y playoffs)
CREATE TABLE lf_fechas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id     uuid NOT NULL REFERENCES lf_ligas(id) ON DELETE CASCADE,
  numero      int NOT NULL,
  nombre      text,
  fecha       date,
  es_playoff  boolean NOT NULL DEFAULT false,
  fase_playoff text CHECK (fase_playoff IS NULL OR fase_playoff IN
               ('cuartos','semifinal','tercer_lugar','final')),
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','en_curso','finalizada','suspendida')),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_fechas_liga ON lf_fechas(liga_id);

-- FK diferida: jugador sancionado hasta cierta fecha
ALTER TABLE lf_jugadores
  ADD CONSTRAINT lf_jugadores_sancionado_fk
  FOREIGN KEY (sancionado_hasta_fecha_id) REFERENCES lf_fechas(id) ON DELETE SET NULL;

-- 6. Partidos
CREATE TABLE lf_partidos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           uuid NOT NULL REFERENCES lf_ligas(id) ON DELETE CASCADE,
  fecha_id          uuid REFERENCES lf_fechas(id) ON DELETE SET NULL,
  grupo_id          uuid REFERENCES lf_grupos(id) ON DELETE SET NULL,
  equipo_local_id   uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  equipo_visita_id  uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  goles_local       int,
  goles_visita      int,
  hora              time,
  cancha            text,
  estado            text NOT NULL DEFAULT 'programado'
                    CHECK (estado IN ('programado','en_curso','finalizado','wo','suspendido','reprogramado')),
  equipo_wo_id      uuid REFERENCES lf_equipos(id) ON DELETE SET NULL,
  nueva_fecha       date,
  nueva_hora        time,
  observaciones     text,
  orden_bracket     int,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_partidos_liga ON lf_partidos(liga_id);
CREATE INDEX idx_lf_partidos_fecha ON lf_partidos(fecha_id);
CREATE INDEX idx_lf_partidos_local ON lf_partidos(equipo_local_id);
CREATE INDEX idx_lf_partidos_visita ON lf_partidos(equipo_visita_id);

-- 7. Goles
CREATE TABLE lf_goles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id  uuid NOT NULL REFERENCES lf_partidos(id) ON DELETE CASCADE,
  jugador_id  uuid NOT NULL REFERENCES lf_jugadores(id) ON DELETE CASCADE,
  equipo_id   uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  minuto      int,
  tipo        text NOT NULL DEFAULT 'normal'
              CHECK (tipo IN ('normal','penal','autogol')),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_goles_partido ON lf_goles(partido_id);
CREATE INDEX idx_lf_goles_jugador ON lf_goles(jugador_id);

-- 8. Tarjetas
CREATE TABLE lf_tarjetas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id  uuid NOT NULL REFERENCES lf_partidos(id) ON DELETE CASCADE,
  jugador_id  uuid NOT NULL REFERENCES lf_jugadores(id) ON DELETE CASCADE,
  equipo_id   uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('amarilla','roja','doble_amarilla')),
  minuto      int,
  motivo      text,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_tarjetas_partido ON lf_tarjetas(partido_id);
CREATE INDEX idx_lf_tarjetas_jugador ON lf_tarjetas(jugador_id);

-- 9. Sanciones
CREATE TABLE lf_sanciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id             uuid NOT NULL REFERENCES lf_ligas(id) ON DELETE CASCADE,
  jugador_id          uuid NOT NULL REFERENCES lf_jugadores(id) ON DELETE CASCADE,
  equipo_id           uuid NOT NULL REFERENCES lf_equipos(id) ON DELETE CASCADE,
  tarjeta_id          uuid REFERENCES lf_tarjetas(id) ON DELETE SET NULL,
  tipo                text NOT NULL CHECK (tipo IN ('suspension_fechas','suspension_permanente','multa','amonestacion')),
  fechas_suspension   int,
  fecha_desde_id      uuid REFERENCES lf_fechas(id) ON DELETE SET NULL,
  fecha_hasta_id      uuid REFERENCES lf_fechas(id) ON DELETE SET NULL,
  motivo              text,
  estado              text NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa','cumplida','anulada')),
  creado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_sanciones_liga ON lf_sanciones(liga_id);
CREATE INDEX idx_lf_sanciones_jugador ON lf_sanciones(jugador_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Realtime: publicar las tablas que necesitan actualización en vivo
-- ═══════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE lf_ligas;
ALTER PUBLICATION supabase_realtime ADD TABLE lf_equipos;
ALTER PUBLICATION supabase_realtime ADD TABLE lf_partidos;
ALTER PUBLICATION supabase_realtime ADD TABLE lf_goles;
ALTER PUBLICATION supabase_realtime ADD TABLE lf_tarjetas;
ALTER PUBLICATION supabase_realtime ADD TABLE lf_fechas;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS: todas las tablas con políticas basadas en club_id
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE lf_ligas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_fechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_goles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lf_sanciones ENABLE ROW LEVEL SECURITY;

-- Política base: lf_ligas directamente por club_id
CREATE POLICY "lf_ligas_club" ON lf_ligas
  FOR ALL USING (
    club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())
  );

-- Las demás tablas vía join con lf_ligas
CREATE POLICY "lf_grupos_club" ON lf_grupos
  FOR ALL USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

CREATE POLICY "lf_equipos_club" ON lf_equipos
  FOR ALL USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

CREATE POLICY "lf_jugadores_club" ON lf_jugadores
  FOR ALL USING (
    equipo_id IN (SELECT id FROM lf_equipos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

CREATE POLICY "lf_fechas_club" ON lf_fechas
  FOR ALL USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

CREATE POLICY "lf_partidos_club" ON lf_partidos
  FOR ALL USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

CREATE POLICY "lf_goles_club" ON lf_goles
  FOR ALL USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

CREATE POLICY "lf_tarjetas_club" ON lf_tarjetas
  FOR ALL USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

CREATE POLICY "lf_sanciones_club" ON lf_sanciones
  FOR ALL USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

-- Vista pública: partidos y goles de ligas públicas (sin auth)
CREATE POLICY "lf_ligas_publica" ON lf_ligas
  FOR SELECT USING (es_publica = true);

CREATE POLICY "lf_equipos_publica" ON lf_equipos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true)
  );

CREATE POLICY "lf_jugadores_publica" ON lf_jugadores
  FOR SELECT USING (
    equipo_id IN (SELECT id FROM lf_equipos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true))
  );

CREATE POLICY "lf_fechas_publica" ON lf_fechas
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true)
  );

CREATE POLICY "lf_partidos_publica" ON lf_partidos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true)
  );

CREATE POLICY "lf_goles_publica" ON lf_goles
  FOR SELECT USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true))
  );

CREATE POLICY "lf_tarjetas_publica" ON lf_tarjetas
  FOR SELECT USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true))
  );

CREATE POLICY "lf_sanciones_publica" ON lf_sanciones
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true)
  );

CREATE POLICY "lf_grupos_publica" ON lf_grupos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE es_publica = true)
  );

COMMIT;
