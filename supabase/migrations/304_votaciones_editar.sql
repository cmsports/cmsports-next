-- Votaciones: editar una votación ya creada (nombre, descripción y quiénes
-- pueden votar).
--
-- SOLO Asociación TDM Buin y Paine. Agrega dos RPC; no crea tablas, no cambia
-- ninguna fila existente ni toca las políticas de la 303.
--
-- ── Qué se puede editar ───────────────────────────────────────────────────
-- · Nombre y descripción: siempre, esté abierta o cerrada.
-- · Quiénes pueden votar: solo mientras la votación está abierta. Se agregan y
--   se quitan jugadores de `votacion_votantes`.
--
-- ── Quien ya votó no se puede quitar ──────────────────────────────────────
-- El voto es secreto: no se sabe cuál es el suyo, así que no se puede
-- retirarlo sin descuadrar los totales. Quitar de la lista a alguien que ya
-- votó haría que "votaron 18 de 24" contara un voto de alguien que ya no está
-- habilitado. El RPC lo rechaza y la pantalla ya los muestra fijos.
--
-- ── Carrera con un voto ───────────────────────────────────────────────────
-- Igual que `votar_atomico`, el RPC bloquea la fila de la votación: si alguien
-- vota justo mientras el profe lo saca de la lista, uno espera al otro y el
-- segundo ve el resultado del primero.
--
-- Las opciones (a quién se vota) no se editan acá: borrar una opción con votos
-- se llevaría esos votos con ella (ON DELETE CASCADE).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('304_votaciones_editar');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');


-- ══ 1. Editar ═════════════════════════════════════════════════════════════
-- p_votantes NULL = no tocar la lista de votantes (solo nombre y descripción).
-- Si viene, es la lista COMPLETA que queda, no un agregado.
CREATE FUNCTION public.editar_votacion_atomico(
  p_votacion_id uuid,
  p_titulo text,
  p_descripcion text,
  p_votantes uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_estado text; v_votantes uuid[];
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden editar votaciones';
  END IF;

  IF p_titulo IS NULL OR length(btrim(p_titulo)) = 0 THEN RAISE EXCEPTION 'La votación necesita un nombre'; END IF;
  IF length(btrim(p_titulo)) > 120 THEN RAISE EXCEPTION 'El nombre supera los 120 caracteres'; END IF;
  IF length(COALESCE(p_descripcion, '')) > 500 THEN RAISE EXCEPTION 'La descripción supera los 500 caracteres'; END IF;

  -- Bloquea la fila: un voto y esta edición no se cruzan.
  SELECT estado INTO v_estado
  FROM public.votaciones WHERE id = p_votacion_id AND club_id = v_club_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Votación no encontrada'; END IF;

  UPDATE public.votaciones
  SET titulo = btrim(p_titulo),
      descripcion = NULLIF(btrim(COALESCE(p_descripcion, '')), '')
  WHERE id = p_votacion_id AND club_id = v_club_id;

  IF p_votantes IS NULL THEN RETURN; END IF;

  IF v_estado <> 'abierta' THEN
    RAISE EXCEPTION 'Solo se puede cambiar quién vota mientras la votación está abierta';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_votantes FROM unnest(p_votantes) x;
  IF cardinality(v_votantes) = 0 THEN RAISE EXCEPTION 'Elige al menos un jugador que pueda votar'; END IF;
  IF (SELECT count(*) FROM public.jugadores WHERE id = ANY(v_votantes) AND club_id = v_club_id) <> cardinality(v_votantes) THEN
    RAISE EXCEPTION 'Hay votantes que no son de este club';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.votacion_votos
    WHERE votacion_id = p_votacion_id AND NOT (votante_jugador_id = ANY(v_votantes))
  ) THEN
    RAISE EXCEPTION 'No se puede quitar a quien ya votó: su voto es secreto y no se puede retirar';
  END IF;

  DELETE FROM public.votacion_votantes
  WHERE votacion_id = p_votacion_id AND NOT (jugador_id = ANY(v_votantes));

  INSERT INTO public.votacion_votantes (votacion_id, club_id, jugador_id)
  SELECT p_votacion_id, v_club_id, x FROM unnest(v_votantes) x
  ON CONFLICT (votacion_id, jugador_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.editar_votacion_atomico(uuid, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_votacion_atomico(uuid, text, text, uuid[]) TO authenticated;


-- ══ 2. Quiénes votan hoy, y cuáles ya votaron ═════════════════════════════
-- La pantalla de edición necesita saber a quiénes no puede quitar. El staff no
-- lee `votacion_votos` (voto secreto), así que lo dice este RPC: solo "ya
-- votó sí/no" por jugador, nunca por quién votó.
CREATE FUNCTION public.votantes_de_votacion(p_votacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_club_id uuid;
BEGIN
  v_club_id := public._votaciones_club();
  IF public.get_my_rol() NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor ven quién puede votar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votaciones WHERE id = p_votacion_id AND club_id = v_club_id) THEN
    RAISE EXCEPTION 'Votación no encontrada';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', vv.jugador_id, 'nombre', j.nombre, 'voto', (v.id IS NOT NULL))
                     ORDER BY j.nombre)
    FROM public.votacion_votantes vv
    JOIN public.jugadores j ON j.id = vv.jugador_id
    LEFT JOIN public.votacion_votos v
      ON v.votacion_id = vv.votacion_id AND v.votante_jugador_id = vv.jugador_id
    WHERE vv.votacion_id = p_votacion_id
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.votantes_de_votacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.votantes_de_votacion(uuid) TO authenticated;

COMMIT;


-- ── Verificación (solo lee; se puede correr aparte) ───────────────────────
-- 1) Las dos funciones existen: dos filas.
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('editar_votacion_atomico', 'votantes_de_votacion') ORDER BY proname;

-- 2) Ninguna es ejecutable por anon: dos filas con false.
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE')
-- FROM pg_proc WHERE proname IN ('editar_votacion_atomico', 'votantes_de_votacion');
