-- ────────────────────────────────────────────────────────────
-- El alumno le deja feedback al profesor. Con su nombre, o anónimo.
--
-- Este cambio afecta a: Spinhouse (2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41).
-- La tabla existe para todos, pero la pantalla se enciende con el módulo
-- `feedback_profes`, y esta migración solo se lo activa a Spinhouse.
--
-- Es el espejo de `feedback_jugadores` (migración 120), donde el profe escribe
-- sobre el alumno. Acá va al revés.
--
-- ── LO ANÓNIMO TIENE QUE SER ANÓNIMO DE VERDAD ───────────────────────────
-- La RLS de Postgres filtra FILAS, no columnas: no hay forma de darle la fila
-- al profesor con el `jugador_id` escondido. Por eso el profesor y el admin no
-- leen esta tabla en absoluto —no tienen política de SELECT— y la ven por
-- `feedback_de_profesores()`, que devuelve el nombre del autor en NULL cuando
-- es anónimo.
--
-- El `jugador_id` SÍ se guarda igual. Sirve para que el alumno vea y borre lo
-- suyo, y para investigar un abuso de verdad; pero eso se hace con SQL, a mano
-- y dejando rastro, no desde una pantalla. La app no lo revela nunca, tampoco
-- al admin: en Buin los admin son entrenadores, así que un admin que puede ver
-- quién escribió qué vacía la palabra "anónimo".
--
-- Borrar tampoco es una política de DELETE para el admin: `DELETE ... RETURNING
-- jugador_id` le devolvería justo lo que no puede ver. Va por función.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('228_feedback_a_profesores_spinhouse');

-- ══ 1. La tabla ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feedback_profesores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubes(id)      ON DELETE CASCADE,
  profesor_id uuid NOT NULL REFERENCES public.profesores(id)  ON DELETE CASCADE,

  -- Siempre se guarda, incluso si es anónimo. Ver la nota de arriba.
  jugador_id  uuid NOT NULL REFERENCES public.jugadores(id)   ON DELETE CASCADE,

  anonimo     boolean NOT NULL DEFAULT false,
  comentario  text NOT NULL CHECK (btrim(comentario) <> ''),
  fecha       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  creado_en   timestamptz NOT NULL DEFAULT now(),

  -- Uno por profesor por día. No es una regla de negocio, es un freno al
  -- spam: si se arrepiente, borra el suyo y escribe otro.
  CONSTRAINT feedback_profesores_uno_por_dia UNIQUE (jugador_id, profesor_id, fecha)
);

CREATE INDEX IF NOT EXISTS feedback_profes_profesor_idx
  ON public.feedback_profesores (profesor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS feedback_profes_club_idx
  ON public.feedback_profesores (club_id, fecha DESC);

COMMENT ON COLUMN public.feedback_profesores.jugador_id IS
  'Se guarda siempre. Cuando anonimo = true la app NUNCA lo muestra, ni al admin: solo es consultable por SQL para investigar un abuso.';


-- ══ 2. Quién ve y quién escribe ═══════════════════════════════════════════
ALTER TABLE public.feedback_profesores ENABLE ROW LEVEL SECURITY;

-- El alumno maneja lo suyo: lo escribe, lo relee y lo borra si se arrepintió.
-- Es la única política de la tabla. Nadie más la toca directo.
DROP POLICY IF EXISTS "feedback_profes_propio" ON public.feedback_profesores;
CREATE POLICY "feedback_profes_propio" ON public.feedback_profesores
  FOR ALL
  USING      (jugador_id = get_my_jugador_id())
  WITH CHECK (
    jugador_id = get_my_jugador_id()
    AND club_id = get_my_club_id()
    -- El profesor tiene que ser de su club: el id llega del navegador.
    AND EXISTS (
      SELECT 1 FROM profesores p
      WHERE p.id = profesor_id AND p.club_id = get_my_club_id()
    )
  );


-- ══ 3. Cómo lo lee el profesor ════════════════════════════════════════════
-- Devuelve el autor en NULL cuando es anónimo. El profesor ve solo lo suyo; el
-- admin, todo lo del club. Ninguno de los dos ve quién escribió lo anónimo.
CREATE OR REPLACE FUNCTION public.feedback_de_profesores(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
) RETURNS TABLE (
  id              uuid,
  profesor_id     uuid,
  profesor_nombre text,
  fecha           date,
  comentario      text,
  anonimo         boolean,
  autor           text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_yo   uuid;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();

  -- El NULL se comprueba aparte: `NULL NOT IN (...)` no es verdadero y dejaría
  -- pasar a quien no tiene rol.
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden leer este feedback';
  END IF;

  -- Un profesor sin ficha enlazada no ve nada, en vez de verlo todo: si
  -- get_my_profesor_id() devuelve NULL, el filtro de abajo no encuentra fila.
  v_yo := get_my_profesor_id();

  RETURN QUERY
  SELECT
    f.id,
    f.profesor_id,
    p.nombre,
    f.fecha,
    f.comentario,
    f.anonimo,
    -- Acá vive toda la promesa del anonimato.
    CASE WHEN f.anonimo THEN NULL ELSE j.nombre END
  FROM feedback_profesores f
  JOIN profesores p ON p.id = f.profesor_id
  JOIN jugadores  j ON j.id = f.jugador_id
  WHERE f.club_id = v_club
    AND (p_desde IS NULL OR f.fecha >= p_desde)
    AND (p_hasta IS NULL OR f.fecha <= p_hasta)
    AND (v_rol IN ('admin','superadmin') OR f.profesor_id = v_yo)
  ORDER BY f.fecha DESC, f.creado_en DESC;
END $$;

REVOKE ALL ON FUNCTION public.feedback_de_profesores(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.feedback_de_profesores(date, date) TO authenticated;


-- ══ 4. Cómo lo borra el admin ═════════════════════════════════════════════
-- Por función y no por política de DELETE: con una política, un
-- `DELETE ... RETURNING jugador_id` desde la API le devolvería al admin
-- exactamente el dato que el anonimato le niega.
CREATE OR REPLACE FUNCTION public.borrar_feedback_profesor(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Solo el admin puede borrar un feedback';
  END IF;

  DELETE FROM feedback_profesores WHERE id = p_id AND club_id = v_club;
END $$;

REVOKE ALL ON FUNCTION public.borrar_feedback_profesor(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.borrar_feedback_profesor(uuid) TO authenticated;


-- ══ 5. Realtime ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'feedback_profesores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_profesores;
  END IF;
END $$;


-- ══ 6. El módulo, solo para Spinhouse ═════════════════════════════════════
UPDATE clubes
SET modulos_habilitados =
  array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'feedback_profes')
WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND NOT ('feedback_profes' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Espera solo Spinhouse:
-- SELECT nombre FROM clubes WHERE 'feedback_profes' = ANY(modulos_habilitados);
--
-- Espera UNA sola política, feedback_profes_propio. Si aparece alguna de
-- SELECT para staff, el anonimato está roto:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feedback_profesores';
--
-- Espera 'feedback_profesores':
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'feedback_profesores';
