-- 065_performance_indexes.sql
-- Índices compuestos para queries de alta frecuencia.
-- Todos usan IF NOT EXISTS — sin riesgo si ya existen.

-- ── Asistencia ────────────────────────────────────────────────────────────────
-- Query más frecuente del sistema: filtrar por club + rango de fechas
CREATE INDEX IF NOT EXISTS idx_asistencia_club_fecha
  ON asistencia(club_id, fecha DESC);

-- Filtrar asistencia de un jugador (perfil, estado-cuenta, reportes)
CREATE INDEX IF NOT EXISTS idx_asistencia_jugador_fecha
  ON asistencia(jugador_id, fecha DESC);

-- ── Mensualidades ─────────────────────────────────────────────────────────────
-- Filtrar por jugador + período (perfil, estado-cuenta)
CREATE INDEX IF NOT EXISTS idx_mensualidades_jugador_periodo
  ON mensualidades(jugador_id, anio DESC, mes DESC);

-- Filtrar por club + período (finanzas, reportes)
CREATE INDEX IF NOT EXISTS idx_mensualidades_club_periodo
  ON mensualidades(club_id, anio, mes);

-- ── Jugadores ─────────────────────────────────────────────────────────────────
-- Índice parcial: jugadores activos del club (la gran mayoría de queries)
CREATE INDEX IF NOT EXISTS idx_jugadores_club_activo
  ON jugadores(club_id, nombre)
  WHERE estado = 'activo';

-- ── Movimientos ───────────────────────────────────────────────────────────────
-- Filtrar movimientos por club + período (finanzas)
CREATE INDEX IF NOT EXISTS idx_movimientos_club_fecha
  ON movimientos(club_id, fecha DESC);

-- ── Torneos ───────────────────────────────────────────────────────────────────
-- Torneos activos del club ordenados por fecha
CREATE INDEX IF NOT EXISTS idx_torneos_club_fecha
  ON torneos(club_id, fecha_inicio DESC)
  WHERE estado != 'archivado';

-- ── Torneo partidos ───────────────────────────────────────────────────────────
-- Buscar partidos de un torneo (carga inicial del torneo)
CREATE INDEX IF NOT EXISTS idx_torneo_partidos_torneo
  ON torneo_partidos(torneo_id, fase);

-- ── Historial horarios ────────────────────────────────────────────────────────
-- Ya creado en 064, pero aseguramos el índice de rango compuesto
CREATE INDEX IF NOT EXISTS idx_jhh_rango_completo
  ON jugador_horario_historial(club_id, jugador_id, vigente_desde, vigente_hasta);

-- ── Evaluaciones ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_evaluaciones_jugador
  ON evaluaciones_trimestrales(jugador_id, creado_en DESC);
