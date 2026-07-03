-- ============================================================
-- CmSports — Liga presencial por divisiones (tenis de mesa)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--
-- Módulo nuevo e independiente de `torneos` (grupos+playoffs ELO).
-- Liga de temporada regular por divisiones, formato round robin,
-- con motor de programación de mesas/horarios/árbitros.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ligas — temporada de liga
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ligas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubes(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'planificacion'
    CHECK (estado IN ('planificacion', 'en_curso', 'finalizada')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. liga_divisiones — divisiones dentro de una liga
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_divisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0,
  fixture_generado boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 3. liga_division_jugadores — jugadores asignados a una división
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_division_jugadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES liga_divisiones(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, jugador_id)
);

-- ────────────────────────────────────────────────────────────
-- 4. liga_fechas — 5 fechas por liga (la 5ta es de ajuste)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_fechas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  numero int NOT NULL CHECK (numero BETWEEN 1 AND 5),
  es_ajuste boolean NOT NULL DEFAULT false,
  fecha date,
  estado text NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'en_juego', 'finalizada')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liga_id, numero)
);

-- ────────────────────────────────────────────────────────────
-- 5. liga_mesas — mesas físicas disponibles durante la liga
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  numero int NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liga_id, numero)
);

-- ────────────────────────────────────────────────────────────
-- 6. liga_partidos — partidos del fixture
--    HC-05: fecha/mesa/bloque son dinámicos (pueden reubicarse)
--    HC-07: estados válidos
--    HC-08: resultado Bo5 válido
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_partidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  division_id uuid NOT NULL REFERENCES liga_divisiones(id) ON DELETE CASCADE,
  jugador_a_id uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  jugador_b_id uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  arbitro_id uuid REFERENCES jugadores(id) ON DELETE SET NULL,

  fecha_id uuid REFERENCES liga_fechas(id) ON DELETE SET NULL,
  mesa_id uuid REFERENCES liga_mesas(id) ON DELETE SET NULL,
  bloque_horario time,

  estado text NOT NULL DEFAULT 'programado'
    CHECK (estado IN ('programado', 'en_juego', 'finalizado', 'no_jugado', 'walkover', 'pendiente')),

  sets_a int,
  sets_b int,
  ganador_id uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  es_walkover boolean NOT NULL DEFAULT false,
  observaciones text,

  orden_fixture int NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),

  CHECK (jugador_a_id <> jugador_b_id),
  CHECK (arbitro_id IS NULL OR (arbitro_id <> jugador_a_id AND arbitro_id <> jugador_b_id)),
  CHECK (ganador_id IS NULL OR ganador_id IN (jugador_a_id, jugador_b_id)),
  -- HC-08: solo marcadores válidos de Bo5
  CHECK (
    (sets_a IS NULL AND sets_b IS NULL)
    OR (sets_a, sets_b) IN ((3,0), (3,1), (3,2), (0,3), (1,3), (2,3))
  )
);

-- HC-03 / HC-06: una mesa no puede tener dos partidos en el mismo
-- bloque horario de la misma fecha
CREATE UNIQUE INDEX IF NOT EXISTS liga_partidos_mesa_bloque_unico
  ON liga_partidos (fecha_id, mesa_id, bloque_horario)
  WHERE fecha_id IS NOT NULL AND mesa_id IS NOT NULL AND bloque_horario IS NOT NULL;

-- Evitar el mismo enfrentamiento duplicado dentro de una división
CREATE UNIQUE INDEX IF NOT EXISTS liga_partidos_enfrentamiento_unico
  ON liga_partidos (division_id, LEAST(jugador_a_id, jugador_b_id), GREATEST(jugador_a_id, jugador_b_id));

CREATE INDEX IF NOT EXISTS liga_partidos_fecha_idx ON liga_partidos (fecha_id);
CREATE INDEX IF NOT EXISTS liga_partidos_division_idx ON liga_partidos (division_id);

-- ============================================================
-- RLS — mismo patrón que el resto del sistema:
-- lectura para todo el club, escritura solo admin
-- ============================================================
ALTER TABLE ligas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_divisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_division_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_fechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ligas_select" ON ligas;
CREATE POLICY "ligas_select" ON ligas
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "ligas_admin_all" ON ligas;
CREATE POLICY "ligas_admin_all" ON ligas
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "liga_divisiones_select" ON liga_divisiones;
CREATE POLICY "liga_divisiones_select" ON liga_divisiones
  FOR SELECT USING (
    liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_divisiones_admin_all" ON liga_divisiones;
CREATE POLICY "liga_divisiones_admin_all" ON liga_divisiones
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_division_jugadores_select" ON liga_division_jugadores;
CREATE POLICY "liga_division_jugadores_select" ON liga_division_jugadores
  FOR SELECT USING (
    division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "liga_division_jugadores_admin_all" ON liga_division_jugadores;
CREATE POLICY "liga_division_jugadores_admin_all" ON liga_division_jugadores
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "liga_fechas_select" ON liga_fechas;
CREATE POLICY "liga_fechas_select" ON liga_fechas
  FOR SELECT USING (
    liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_fechas_admin_all" ON liga_fechas;
CREATE POLICY "liga_fechas_admin_all" ON liga_fechas
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_mesas_select" ON liga_mesas;
CREATE POLICY "liga_mesas_select" ON liga_mesas
  FOR SELECT USING (
    liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_mesas_admin_all" ON liga_mesas;
CREATE POLICY "liga_mesas_admin_all" ON liga_mesas
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_partidos_select" ON liga_partidos;
CREATE POLICY "liga_partidos_select" ON liga_partidos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_partidos_admin_all" ON liga_partidos;
CREATE POLICY "liga_partidos_admin_all" ON liga_partidos
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );
