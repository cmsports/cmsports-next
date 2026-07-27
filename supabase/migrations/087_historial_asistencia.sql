-- Pasos 3, 4 y 5: lo que necesita el módulo de Asistencia Histórica.
--
--   3. Excepciones por fecha — el día que el profe decide no dictar.
--   4. Estado de la asistencia — presente o ausente, que hoy no se distinguen.
--   5. Auditoría — quién corrigió qué y cuándo.
--
-- El problema que resuelve el punto 4: hasta ahora la tabla solo guardaba
-- presencias. Un día sin fila podía ser "faltó" o "el profe no pasó lista", y
-- no había forma de saber cuál. El calendario necesita distinguir el rojo del
-- azul, así que la ausencia pasa a ser una fila con su estado.
--
-- Decisión del club: la ausencia descuenta sesión igual que la presencia,
-- porque el cupo se ocupó. Por eso `sesiones_usadas` cuenta las dos.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 3. Excepciones por fecha ══════════════════════════════════════════════
-- Feriados, suspensiones, el día que no se abrió. Sin esto, un 18 de
-- septiembre aparecería como entrenamiento pendiente de registrar y ensuciaría
-- todos los porcentajes.
CREATE TABLE IF NOT EXISTS bloque_excepciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloque_id  uuid NOT NULL REFERENCES bloques_horario(id) ON DELETE CASCADE,
  fecha      date NOT NULL,
  motivo     text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bloque_id, fecha)
);

CREATE INDEX IF NOT EXISTS bloque_excepciones_fecha_idx ON bloque_excepciones (fecha);

ALTER TABLE bloque_excepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "excepciones_lectura" ON bloque_excepciones;
CREATE POLICY "excepciones_lectura" ON bloque_excepciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "excepciones_gestion" ON bloque_excepciones;
CREATE POLICY "excepciones_gestion" ON bloque_excepciones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );


-- ══ 4. Estado de la asistencia ════════════════════════════════════════════
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'presente';

ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS asistencia_estado_check;
ALTER TABLE public.asistencia
  ADD CONSTRAINT asistencia_estado_check CHECK (estado IN ('presente', 'ausente'));

-- Un jugador tiene un solo estado por día. Si entrena dos veces el mismo día
-- sigue siendo una sola jornada: es la regla que ya aplicaba el registro y
-- ahora queda garantizada por la base.
DELETE FROM public.asistencia a
USING public.asistencia b
WHERE a.jugador_id = b.jugador_id AND a.fecha = b.fecha AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS asistencia_jugador_fecha_uniq
  ON public.asistencia (jugador_id, fecha);


-- ══ 5. Auditoría ══════════════════════════════════════════════════════════
-- Toda corrección deja rastro. NULL en un estado significa "no existía":
-- estado_anterior NULL es un alta, estado_nuevo NULL es un borrado.
CREATE TABLE IF NOT EXISTS auditoria_asistencia (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id       uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  fecha            date NOT NULL,
  estado_anterior  text,
  estado_nuevo     text,
  motivo           text,
  usuario_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auditoria_asist_jugador_idx ON auditoria_asistencia (jugador_id, fecha);
CREATE INDEX IF NOT EXISTS auditoria_asist_fecha_idx   ON auditoria_asistencia (creado_en DESC);

ALTER TABLE auditoria_asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_asist_lectura" ON auditoria_asistencia;
CREATE POLICY "auditoria_asist_lectura" ON auditoria_asistencia
  FOR SELECT USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));


-- ══ 6. Corregir a mano, con rastro y recalculando sesiones ════════════════
-- Marcar una ausencia vieja mueve el contador de sesiones hacia atrás, así que
-- se recalcula desde el historial en vez de sumar o restar de a uno: es la
-- única forma de que el número no se vaya desviando con cada corrección.
CREATE OR REPLACE FUNCTION public.recalcular_sesiones(p_jugador uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE jugadores SET sesiones_usadas = (
    SELECT count(*) FROM asistencia WHERE jugador_id = p_jugador
  ) WHERE id = p_jugador;
$$;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_manual(
  p_jugador_id uuid,
  p_fecha      date,
  p_estado     text,          -- 'presente' | 'ausente' | 'sin_registro'
  p_motivo     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club     uuid;
  v_rol      text;
  v_anterior text;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden corregir la asistencia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF p_estado NOT IN ('presente', 'ausente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT estado INTO v_anterior FROM asistencia
  WHERE jugador_id = p_jugador_id AND fecha = p_fecha;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = p_fecha;
  ELSE
    INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, metodo, registrado_por)
    VALUES (v_club, p_jugador_id, p_fecha, localtime, p_estado, 'manual', auth.uid())
    ON CONFLICT (jugador_id, fecha) DO UPDATE
      SET estado = EXCLUDED.estado, registrado_por = EXCLUDED.registrado_por;
  END IF;

  -- Nada que auditar si el estado no cambió.
  IF v_anterior IS DISTINCT FROM NULLIF(p_estado, 'sin_registro') THEN
    INSERT INTO auditoria_asistencia
      (club_id, jugador_id, fecha, estado_anterior, estado_nuevo, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_fecha, v_anterior, NULLIF(p_estado, 'sin_registro'), p_motivo, auth.uid());
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
END;
$$;

-- El autorregistro y el registro del staff siguen entrando por su función de
-- siempre, pero ahora dejan el estado explícito.
CREATE OR REPLACE FUNCTION public.registrar_asistencia_segura(
  p_jugador_id uuid,
  p_fecha      date DEFAULT NULL,
  p_hora       time DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club  uuid;
  v_fecha date;
  v_hora  time;
  v_id    uuid;
BEGIN
  SELECT club_id INTO v_club FROM jugadores WHERE id = p_jugador_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santiago')::date);
  v_hora  := COALESCE(p_hora,  (now() AT TIME ZONE 'America/Santiago')::time);

  INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, registrado_por)
  VALUES (v_club, p_jugador_id, v_fecha, v_hora, 'presente', auth.uid())
  ON CONFLICT (jugador_id, fecha) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = v_fecha;
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
  RETURN v_id;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM asistencia)                                   AS asistencias,
  (SELECT count(*) FROM asistencia WHERE estado = 'presente')         AS presentes,
  (SELECT count(*) FROM asistencia WHERE estado = 'ausente')          AS ausentes,
  (SELECT count(*) FROM bloque_excepciones)                           AS excepciones,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('registrar_asistencia_manual', 'recalcular_sesiones')) AS funciones_nuevas;
