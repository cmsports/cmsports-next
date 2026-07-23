-- 064_horario_historial.sql
-- Tabla de historial de horarios + función para consumir sesiones de ausentes

-- ── 1. Tabla historial ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jugador_horario_historial (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id    UUID        NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  club_id       UUID        NOT NULL,
  horario       TEXT,
  entrena_lun   BOOLEAN     NOT NULL DEFAULT false,
  entrena_mar   BOOLEAN     NOT NULL DEFAULT false,
  entrena_mie   BOOLEAN     NOT NULL DEFAULT false,
  entrena_jue   BOOLEAN     NOT NULL DEFAULT false,
  entrena_vie   BOOLEAN     NOT NULL DEFAULT false,
  vigente_desde DATE        NOT NULL,
  vigente_hasta DATE,       -- NULL = registro activo hoy
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jhh_jugador ON jugador_horario_historial(jugador_id);
CREATE INDEX IF NOT EXISTS idx_jhh_club    ON jugador_horario_historial(club_id);
CREATE INDEX IF NOT EXISTS idx_jhh_rango   ON jugador_horario_historial(jugador_id, vigente_desde, vigente_hasta);

-- ── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE jugador_horario_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_historial" ON jugador_horario_historial
  FOR SELECT USING (
    club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())
  );

CREATE POLICY "staff_insert_historial" ON jugador_horario_historial
  FOR INSERT WITH CHECK (
    club_id IN (
      SELECT club_id FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','profesor')
    )
  );

CREATE POLICY "staff_update_historial" ON jugador_horario_historial
  FOR UPDATE USING (
    club_id IN (
      SELECT club_id FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','profesor')
    )
  );

-- ── 3. Función: consumir sesión para ausentes (sin registro de asistencia) ─
CREATE OR REPLACE FUNCTION consumir_sesion_sin_asistencia(
  p_club_id     UUID,
  p_jugador_ids UUID[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE jugadores
     SET sesiones_usadas = sesiones_usadas + 1
   WHERE id        = ANY(p_jugador_ids)
     AND club_id   = p_club_id
     AND estado    = 'activo';
END;
$$;

-- ── 4. Función batch: registrar asistencia de un bloque completo ───────────
-- Registra presentes (asistencia + sesión) y ausentes (solo sesión).
-- Ignora jugadores que ya tengan asistencia en esa fecha.
CREATE OR REPLACE FUNCTION registrar_bloque_asistencia(
  p_club_id   UUID,
  p_fecha     DATE,
  p_hora      TIME,
  p_presentes UUID[],
  p_ausentes  UUID[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  jid UUID;
BEGIN
  -- Presentes: insertar asistencia si no existe + incrementar sesiones
  FOREACH jid IN ARRAY COALESCE(p_presentes, '{}')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM asistencia
      WHERE jugador_id = jid AND fecha = p_fecha
    ) THEN
      INSERT INTO asistencia(club_id, jugador_id, fecha, hora)
      VALUES (p_club_id, jid, p_fecha, p_hora);
      UPDATE jugadores SET sesiones_usadas = sesiones_usadas + 1 WHERE id = jid AND estado = 'activo';
    END IF;
  END LOOP;

  -- Ausentes: solo sesión, solo si no tienen asistencia en esa fecha
  FOREACH jid IN ARRAY COALESCE(p_ausentes, '{}')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM asistencia
      WHERE jugador_id = jid AND fecha = p_fecha
    ) THEN
      UPDATE jugadores SET sesiones_usadas = sesiones_usadas + 1 WHERE id = jid AND estado = 'activo';
    END IF;
  END LOOP;
END;
$$;

-- ── 5. Punto de partida: poblar historial con datos actuales ───────────────
-- vigente_desde = 2026-08-01 (fecha de lanzamiento del sistema)
INSERT INTO jugador_horario_historial
  (jugador_id, club_id, horario, entrena_lun, entrena_mar, entrena_mie, entrena_jue, entrena_vie, vigente_desde)
SELECT
  id,
  club_id,
  horario,
  COALESCE(entrena_lun, false),
  COALESCE(entrena_mar, false),
  COALESCE(entrena_mie, false),
  COALESCE(entrena_jue, false),
  COALESCE(entrena_vie, false),
  '2026-08-01'::DATE
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    entrena_lun IS NOT NULL OR entrena_mar IS NOT NULL OR
    entrena_mie IS NOT NULL OR entrena_jue IS NOT NULL OR
    entrena_vie IS NOT NULL
  );
