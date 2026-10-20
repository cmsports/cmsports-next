-- Votaciones: el profesor abre una votación, decide QUIÉN vota y A QUIÉN se
-- puede votar, y los alumnos votan una sola vez.
--
-- SOLO Asociación TDM Buin y Paine. Crea cuatro tablas vacías, cinco RPC y
-- enciende el módulo 'votaciones' en Buin. No cambia ninguna fila de
-- jugadores, movimientos, asistencia ni de otro club.
--
-- ── Qué hay ───────────────────────────────────────────────────────────────
-- Dos tipos de votación:
--   · 'jugadores': se vota por un compañero ("mejor compañero"). El profe
--     elige la lista de candidatos.
--   · 'opciones': el profe escribe las opciones a mano, para lo que el sistema
--     no tiene registrado ("¿qué día es la convivencia?").
-- En los dos, el profe elige aparte quiénes pueden votar. Las dos listas llegan
-- ya resueltas (ids de jugadores): la pantalla expande "categoría X" a sus
-- jugadores con el mismo filtro del listado, y acá solo se verifica que todos
-- sean del club.
--
-- ── Por qué la lista de votantes se congela ───────────────────────────────
-- `votacion_votantes` guarda una fila por jugador habilitado al abrir. Si un
-- alumno cambia de categoría o entra después, una votación en curso no se
-- mueve, y "votaron 18 de 24" se cuenta sobre una lista fija.
--
-- ── Por qué el voto es secreto ────────────────────────────────────────────
-- `votacion_votos` no tiene política de lectura para el staff: cada alumno lee
-- solo SU voto, y nadie lee el de otro, ni el admin. El profe ve los totales y
-- quiénes ya votaron (para apurar a los que faltan) por `resultados_votacion`,
-- que nunca devuelve quién votó por quién. La tabla no se publica en realtime;
-- en su lugar `votaciones.votos_total` sube con cada voto y esa fila sí está
-- publicada, así la pantalla del profe se entera sin ver el contenido.
--
-- ── Un voto por jugador ───────────────────────────────────────────────────
-- UNIQUE (votacion_id, votante_jugador_id): lo garantiza la base, no la
-- pantalla. Se vota por jugador y no por cuenta, así una persona con dos
-- cuentas no vota dos veces.
--
-- ── Texto congelado ───────────────────────────────────────────────────────
-- Cada opción guarda el nombre tal como era al abrir. Borrar o renombrar a un
-- jugador después no cambia los resultados de una votación ya hecha.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('303_votaciones_buin');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');


-- ══ 1. Las tablas ═════════════════════════════════════════════════════════
CREATE TABLE public.votaciones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid        NOT NULL REFERENCES public.clubes(id),
  titulo           text        NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 120),
  descripcion      text        CHECK (descripcion IS NULL OR length(descripcion) <= 500),
  tipo             text        NOT NULL CHECK (tipo IN ('jugadores', 'opciones')),
  estado           text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  -- Sube con cada voto: es lo que dispara el realtime sin publicar los votos.
  votos_total      integer     NOT NULL DEFAULT 0,
  creada_por       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  creada_por_nombre text,
  creado_en        timestamptz NOT NULL DEFAULT clock_timestamp(),
  cerrada_en       timestamptz
);
CREATE INDEX votaciones_club_idx ON public.votaciones (club_id, creado_en DESC);

CREATE TABLE public.votacion_votantes (
  votacion_id uuid NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  club_id     uuid NOT NULL REFERENCES public.clubes(id),
  jugador_id  uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  PRIMARY KEY (votacion_id, jugador_id)
);
CREATE INDEX votacion_votantes_jugador_idx ON public.votacion_votantes (jugador_id);

CREATE TABLE public.votacion_opciones (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  votacion_id uuid    NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  club_id     uuid    NOT NULL REFERENCES public.clubes(id),
  -- NULL en una opción escrita a mano. Si borran al jugador, la opción queda
  -- con su texto y los votos que ya tenía.
  jugador_id  uuid    REFERENCES public.jugadores(id) ON DELETE SET NULL,
  texto       text    NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 120),
  orden       integer NOT NULL DEFAULT 0
);
CREATE INDEX votacion_opciones_votacion_idx ON public.votacion_opciones (votacion_id, orden);

CREATE TABLE public.votacion_votos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  votacion_id        uuid        NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  club_id            uuid        NOT NULL REFERENCES public.clubes(id),
  votante_jugador_id uuid        NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  opcion_id          uuid        NOT NULL REFERENCES public.votacion_opciones(id) ON DELETE CASCADE,
  creado_en          timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (votacion_id, votante_jugador_id)
);
CREATE INDEX votacion_votos_opcion_idx ON public.votacion_votos (opcion_id);


-- ══ 2. Quién lee qué ══════════════════════════════════════════════════════
ALTER TABLE public.votaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_votantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_votos    ENABLE ROW LEVEL SECURITY;

-- El staff del club ve todas las votaciones; el alumno solo las que lo
-- habilitan a votar. Las opciones siguen la misma regla.
CREATE POLICY votaciones_lee ON public.votaciones
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id()
  AND (
    public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
    OR EXISTS (
      SELECT 1 FROM public.votacion_votantes vv
      WHERE vv.votacion_id = votaciones.id AND vv.jugador_id = public.get_my_jugador_id()
    )
  )
);

CREATE POLICY votacion_votantes_lee ON public.votacion_votantes
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id()
  AND (
    public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
    OR jugador_id = public.get_my_jugador_id()
  )
);

CREATE POLICY votacion_opciones_lee ON public.votacion_opciones
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id()
  AND (
    public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
    OR EXISTS (
      SELECT 1 FROM public.votacion_votantes vv
      WHERE vv.votacion_id = votacion_opciones.votacion_id AND vv.jugador_id = public.get_my_jugador_id()
    )
  )
);

-- Voto secreto: cada alumno lee SOLO el suyo. El staff no tiene política.
CREATE POLICY votacion_votos_lee_el_propio ON public.votacion_votos
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id()
  AND votante_jugador_id = public.get_my_jugador_id()
);

GRANT SELECT ON public.votaciones, public.votacion_votantes,
                public.votacion_opciones, public.votacion_votos TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.votaciones, public.votacion_votantes,
                                 public.votacion_opciones, public.votacion_votos
  FROM anon, authenticated;

-- Sin esto la pantalla se suscribe, no recibe nada nunca y muestra lo viejo
-- (CLAUDE.md, migraciones 121 y 142). `votacion_votos` NO se publica a propósito.
ALTER PUBLICATION supabase_realtime ADD TABLE public.votaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votacion_opciones;


-- ══ 3. Un chequeo común: ¿quién llama y está el módulo? ═══════════════════
-- Devuelve el club del usuario si el módulo está encendido; si no, lanza.
CREATE FUNCTION public._votaciones_club()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_club_id uuid;
BEGIN
  v_club_id := public.get_my_club_id();
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clubes
    WHERE id = v_club_id AND 'votaciones' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[]))
  ) THEN RAISE EXCEPTION 'Las votaciones no están habilitadas para este club'; END IF;
  RETURN v_club_id;
END;
$$;
REVOKE ALL ON FUNCTION public._votaciones_club() FROM PUBLIC, anon, authenticated;


-- ══ 4. Crear ══════════════════════════════════════════════════════════════
-- p_votantes: ids de jugadores que pueden votar (ya expandidos por la pantalla).
-- p_candidatos: ids de jugadores entre los que se elige (tipo 'jugadores').
-- p_opciones: textos escritos a mano (tipo 'opciones').
CREATE FUNCTION public.crear_votacion_atomico(
  p_titulo text,
  p_descripcion text,
  p_tipo text,
  p_votantes uuid[],
  p_candidatos uuid[],
  p_opciones text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid;
  v_votantes uuid[]; v_candidatos uuid[]; v_textos text[];
  v_id uuid; v_nombre text;
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden crear votaciones';
  END IF;

  IF p_titulo IS NULL OR length(btrim(p_titulo)) = 0 THEN RAISE EXCEPTION 'La votación necesita un nombre'; END IF;
  IF p_tipo NOT IN ('jugadores', 'opciones') THEN RAISE EXCEPTION 'Tipo de votación inválido'; END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_votantes FROM unnest(COALESCE(p_votantes, ARRAY[]::uuid[])) x;
  IF cardinality(v_votantes) = 0 THEN RAISE EXCEPTION 'Elige al menos un jugador que pueda votar'; END IF;
  IF (SELECT count(*) FROM public.jugadores WHERE id = ANY(v_votantes) AND club_id = v_club_id) <> cardinality(v_votantes) THEN
    RAISE EXCEPTION 'Hay votantes que no son de este club';
  END IF;

  IF p_tipo = 'jugadores' THEN
    SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_candidatos FROM unnest(COALESCE(p_candidatos, ARRAY[]::uuid[])) x;
    IF cardinality(v_candidatos) < 2 THEN RAISE EXCEPTION 'Elige al menos dos candidatos'; END IF;
    IF (SELECT count(*) FROM public.jugadores WHERE id = ANY(v_candidatos) AND club_id = v_club_id) <> cardinality(v_candidatos) THEN
      RAISE EXCEPTION 'Hay candidatos que no son de este club';
    END IF;
  ELSE
    SELECT COALESCE(array_agg(t ORDER BY o), ARRAY[]::text[]) INTO v_textos
    FROM (
      -- "Sábado" y "sábado" son la misma opción: se agrupa sin mirar mayúsculas.
      SELECT min(btrim(x)) AS t, min(ord) AS o
      FROM unnest(COALESCE(p_opciones, ARRAY[]::text[])) WITH ORDINALITY AS u(x, ord)
      WHERE length(btrim(x)) > 0
      GROUP BY lower(btrim(x))
    ) s;
    IF cardinality(v_textos) < 2 THEN RAISE EXCEPTION 'Escribe al menos dos opciones distintas'; END IF;
    IF cardinality(v_textos) > 20 THEN RAISE EXCEPTION 'Máximo 20 opciones'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_textos) t WHERE length(t) > 120) THEN
      RAISE EXCEPTION 'Una opción supera los 120 caracteres';
    END IF;
  END IF;

  SELECT nombre INTO v_nombre FROM public.perfiles WHERE id = auth.uid();

  INSERT INTO public.votaciones (club_id, titulo, descripcion, tipo, creada_por, creada_por_nombre)
  VALUES (v_club_id, btrim(p_titulo), NULLIF(btrim(COALESCE(p_descripcion, '')), ''), p_tipo, auth.uid(), v_nombre)
  RETURNING id INTO v_id;

  INSERT INTO public.votacion_votantes (votacion_id, club_id, jugador_id)
  SELECT v_id, v_club_id, x FROM unnest(v_votantes) x;

  IF p_tipo = 'jugadores' THEN
    INSERT INTO public.votacion_opciones (votacion_id, club_id, jugador_id, texto, orden)
    SELECT v_id, v_club_id, j.id, j.nombre, row_number() OVER (ORDER BY j.nombre)
    FROM public.jugadores j WHERE j.id = ANY(v_candidatos) AND j.club_id = v_club_id;
  ELSE
    INSERT INTO public.votacion_opciones (votacion_id, club_id, texto, orden)
    SELECT v_id, v_club_id, t, ord
    FROM unnest(v_textos) WITH ORDINALITY AS u(t, ord);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.crear_votacion_atomico(text, text, text, uuid[], uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_votacion_atomico(text, text, text, uuid[], uuid[], text[]) TO authenticated;


-- ══ 5. Abrir / cerrar y borrar ════════════════════════════════════════════
CREATE FUNCTION public.cambiar_estado_votacion_atomico(p_votacion_id uuid, p_estado text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_club_id uuid;
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden abrir o cerrar votaciones';
  END IF;
  IF p_estado NOT IN ('abierta', 'cerrada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;

  UPDATE public.votaciones
  SET estado = p_estado,
      cerrada_en = CASE WHEN p_estado = 'cerrada' THEN clock_timestamp() ELSE NULL END
  WHERE id = p_votacion_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Votación no encontrada'; END IF;
  RETURN p_estado;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_votacion_atomico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_votacion_atomico(uuid, text) TO authenticated;

-- Borra la votación entera con sus opciones, votantes y votos. Sirve para
-- las de prueba; la pantalla pide confirmar. Los resultados que se quieran
-- conservar se exportan a PDF antes.
CREATE FUNCTION public.eliminar_votacion_atomico(p_votacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_club_id uuid;
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden borrar votaciones';
  END IF;
  DELETE FROM public.votaciones WHERE id = p_votacion_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Votación no encontrada'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.eliminar_votacion_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_votacion_atomico(uuid) TO authenticated;


-- ══ 6. Votar ══════════════════════════════════════════════════════════════
CREATE FUNCTION public.votar_atomico(p_votacion_id uuid, p_opcion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_jugador_id uuid;
  v_estado text; v_opcion_jugador uuid;
BEGIN
  v_club_id := public._votaciones_club();
  v_jugador_id := public.get_my_jugador_id();
  IF v_jugador_id IS NULL THEN RAISE EXCEPTION 'Solo los jugadores pueden votar'; END IF;

  -- Bloquea la fila de la votación: un cierre y un voto simultáneos no se cruzan.
  SELECT estado INTO v_estado
  FROM public.votaciones WHERE id = p_votacion_id AND club_id = v_club_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Votación no encontrada'; END IF;
  IF v_estado <> 'abierta' THEN RAISE EXCEPTION 'Esta votación ya está cerrada'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.votacion_votantes
    WHERE votacion_id = p_votacion_id AND jugador_id = v_jugador_id
  ) THEN RAISE EXCEPTION 'No estás habilitado para votar en esta votación'; END IF;

  SELECT jugador_id INTO v_opcion_jugador
  FROM public.votacion_opciones WHERE id = p_opcion_id AND votacion_id = p_votacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa opción no pertenece a la votación'; END IF;
  IF v_opcion_jugador IS NOT NULL AND v_opcion_jugador = v_jugador_id THEN
    RAISE EXCEPTION 'No puedes votar por ti mismo';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.votacion_votos
    WHERE votacion_id = p_votacion_id AND votante_jugador_id = v_jugador_id
  ) THEN RAISE EXCEPTION 'Ya votaste en esta votación'; END IF;

  INSERT INTO public.votacion_votos (votacion_id, club_id, votante_jugador_id, opcion_id)
  VALUES (p_votacion_id, v_club_id, v_jugador_id, p_opcion_id);

  UPDATE public.votaciones SET votos_total = votos_total + 1 WHERE id = p_votacion_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.votar_atomico(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.votar_atomico(uuid, uuid) TO authenticated;


-- ══ 7. Resultados (solo staff) ════════════════════════════════════════════
-- Totales por opción, quiénes votaron y quiénes faltan. NUNCA quién votó por
-- quién. Es lo que lee la pantalla del profe y lo que va al PDF.
CREATE FUNCTION public.resultados_votacion(p_votacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_vot public.votaciones%ROWTYPE;
  v_opciones jsonb; v_votaron jsonb; v_faltan jsonb; v_habilitados integer;
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor ven los resultados';
  END IF;

  SELECT * INTO v_vot FROM public.votaciones WHERE id = p_votacion_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Votación no encontrada'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'votos', votos)
                            ORDER BY votos DESC, orden), '[]'::jsonb)
  INTO v_opciones
  FROM (
    SELECT o.id, o.texto, o.orden, count(v.id)::integer AS votos
    FROM public.votacion_opciones o
    LEFT JOIN public.votacion_votos v ON v.opcion_id = o.id
    WHERE o.votacion_id = p_votacion_id
    GROUP BY o.id, o.texto, o.orden
  ) t;

  SELECT count(*)::integer INTO v_habilitados FROM public.votacion_votantes WHERE votacion_id = p_votacion_id;

  SELECT COALESCE(jsonb_agg(nombre ORDER BY nombre), '[]'::jsonb) INTO v_votaron
  FROM (
    SELECT j.nombre FROM public.votacion_votos v
    JOIN public.jugadores j ON j.id = v.votante_jugador_id
    WHERE v.votacion_id = p_votacion_id
  ) t;

  SELECT COALESCE(jsonb_agg(nombre ORDER BY nombre), '[]'::jsonb) INTO v_faltan
  FROM (
    SELECT j.nombre FROM public.votacion_votantes vv
    JOIN public.jugadores j ON j.id = vv.jugador_id
    WHERE vv.votacion_id = p_votacion_id
      AND NOT EXISTS (
        SELECT 1 FROM public.votacion_votos v
        WHERE v.votacion_id = p_votacion_id AND v.votante_jugador_id = vv.jugador_id
      )
  ) t;

  RETURN jsonb_build_object(
    'titulo', v_vot.titulo, 'descripcion', v_vot.descripcion, 'tipo', v_vot.tipo,
    'estado', v_vot.estado, 'creado_en', v_vot.creado_en, 'cerrada_en', v_vot.cerrada_en,
    'habilitados', v_habilitados, 'votos_total', v_vot.votos_total,
    'opciones', v_opciones, 'votaron', v_votaron, 'faltan', v_faltan
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resultados_votacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resultados_votacion(uuid) TO authenticated;


-- ══ 8. El módulo, encendido solo en Buin ══════════════════════════════════
UPDATE public.clubes
SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'votaciones')
WHERE id = _migracion_para_club('Asociación TDM Buin y Paine')
  AND NOT ('votaciones' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;


-- ── Verificación (solo lee; se puede correr aparte) ───────────────────────
-- 1) Las cuatro tablas existen y están vacías: cuatro filas con 0.
-- SELECT 'votaciones' t, count(*) FROM votaciones UNION ALL
-- SELECT 'votantes', count(*) FROM votacion_votantes UNION ALL
-- SELECT 'opciones', count(*) FROM votacion_opciones UNION ALL
-- SELECT 'votos', count(*) FROM votacion_votos;

-- 2) Publicadas en realtime: votaciones y votacion_opciones, NO votacion_votos.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename LIKE 'votacion%' ORDER BY tablename;

-- 3) El módulo quedó solo en Buin: una fila, Asociación TDM Buin y Paine.
-- SELECT nombre FROM clubes WHERE 'votaciones' = ANY(modulos_habilitados);
