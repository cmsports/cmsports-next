-- Módulo de Feedback / Retroalimentación: el profe deja un comentario libre a
-- un alumno (fecha, hora, texto). Sin aceptar/rechazar, sin notificaciones —
-- es deliberadamente más simple que el feedback trimestral que se eliminó por
-- completo en julio (commit 6e708f4): esto es solo una bitácora.
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS feedback_jugadores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id   uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  autor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot del nombre: si se borra la cuenta del profe, el comentario sigue
  -- diciendo quién lo escribió.
  autor_nombre text NOT NULL,
  fecha        date NOT NULL,
  hora         time,
  comentario   text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  editado_en   timestamptz
);

CREATE INDEX IF NOT EXISTS feedback_jugadores_jugador_idx ON feedback_jugadores (jugador_id, fecha DESC);
CREATE INDEX IF NOT EXISTS feedback_jugadores_club_idx ON feedback_jugadores (club_id);

ALTER TABLE feedback_jugadores ENABLE ROW LEVEL SECURITY;

-- Staff ve todo el club; el jugador solo lo suyo.
DROP POLICY IF EXISTS "feedback_lectura" ON feedback_jugadores;
CREATE POLICY "feedback_lectura" ON feedback_jugadores
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (get_my_rol() IN ('admin', 'superadmin', 'profesor') OR jugador_id = get_my_jugador_id())
  );

DROP POLICY IF EXISTS "feedback_crear" ON feedback_jugadores;
CREATE POLICY "feedback_crear" ON feedback_jugadores
  FOR INSERT WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
    AND autor_id = auth.uid()
  );

-- Editar/borrar: admin o superadmin cualquiera; el profesor solo lo que él
-- mismo escribió.
DROP POLICY IF EXISTS "feedback_editar" ON feedback_jugadores;
CREATE POLICY "feedback_editar" ON feedback_jugadores
  FOR UPDATE USING (
    club_id = get_my_club_id()
    AND (get_my_rol() IN ('admin', 'superadmin') OR autor_id = auth.uid())
  ) WITH CHECK (
    club_id = get_my_club_id()
    AND (get_my_rol() IN ('admin', 'superadmin') OR autor_id = auth.uid())
  );

DROP POLICY IF EXISTS "feedback_borrar" ON feedback_jugadores;
CREATE POLICY "feedback_borrar" ON feedback_jugadores
  FOR DELETE USING (
    club_id = get_my_club_id()
    AND (get_my_rol() IN ('admin', 'superadmin') OR autor_id = auth.uid())
  );

-- Habilita el módulo nuevo para Asociación Buin.
UPDATE clubes
SET modulos_habilitados = array_append(modulos_habilitados, 'feedback')
WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND NOT ('feedback' = ANY(modulos_habilitados));

COMMIT;
