-- ============================================================
-- CmSports — Restricciones de disponibilidad en la liga
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--
-- Para qué: al programar, los jugadores avisan cosas como "no puedo ir
-- a la fecha 3" o "sólo puedo en la mañana". Hasta ahora eso se resolvía
-- moviendo partidos a mano después. Esta tabla lo convierte en un dato
-- que el programador respeta como regla dura, igual que el hueco máximo.
--
-- Una fila = una cosa que el jugador no puede:
--   fecha_numero NULL           → aplica a todas las fechas
--   hora_desde y hora_hasta NULL → no puede esa fecha entera
--   con horas                    → sólo puede jugar dentro de ese rango
--
-- Es acumulativa: se agregan filas a medida que aparecen los imprevistos,
-- y se vuelve a apretar Programar. Como cada fila guarda quién la creó y
-- cuándo, la tabla es también el historial de por qué el horario cambió.
-- ============================================================

CREATE TABLE IF NOT EXISTS liga_restricciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id      uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  jugador_id   uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,

  -- NULL = todas las fechas de la liga.
  fecha_numero int,

  -- Ambas NULL = la fecha completa queda vedada.
  hora_desde   time,
  hora_hasta   time,

  motivo       text,
  creado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,

  -- Un rango al revés (desde 15:00 hasta 10:00) no dejaría jugar nunca.
  CONSTRAINT liga_restricciones_rango_valido
    CHECK (hora_desde IS NULL OR hora_hasta IS NULL OR hora_desde <= hora_hasta),
  CONSTRAINT liga_restricciones_fecha_valida
    CHECK (fecha_numero IS NULL OR fecha_numero >= 1)
);

-- El programador lee todas las restricciones vigentes de una liga de una vez.
CREATE INDEX IF NOT EXISTS idx_liga_restricciones_liga
  ON liga_restricciones (liga_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_liga_restricciones_jugador
  ON liga_restricciones (jugador_id) WHERE deleted_at IS NULL;

ALTER TABLE liga_restricciones ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que el resto de las tablas de liga: se ve lo del propio
-- club, y sólo el admin escribe.
DROP POLICY IF EXISTS "liga_restricciones_select" ON liga_restricciones;
CREATE POLICY "liga_restricciones_select" ON liga_restricciones
  FOR SELECT USING (
    liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "liga_restricciones_admin_all" ON liga_restricciones;
CREATE POLICY "liga_restricciones_admin_all" ON liga_restricciones
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM ligas WHERE club_id = get_my_club_id())
  );
