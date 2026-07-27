-- Emitir una cuota deja de inventar el monto cuando el jugador no tiene.
--
-- La función estimaba a partir del plan de sesiones:
--   coalesce(j.mensualidad, CASE j.sesiones_limite
--     WHEN 4 THEN 15000 WHEN 8 THEN 25000 WHEN 12 THEN 30000
--     WHEN 16 THEN 40000 ELSE 25000 END)
--
-- Hoy hay ocho jugadores sin cuota asignada, así que al emitir agosto les
-- habría caído un monto genérico. Y un monto inventado se ve igual de real que
-- uno correcto: nadie lo revisa y termina cobrado.
--
-- El profe define cada cuota a mano —hay de $7.000, de $21.000, de $50.000— y
-- ninguna tabla puede adivinarlas. Sin cuota asignada la mensualidad se emite
-- sin monto, y la pantalla muestra "Cuota por asignar".
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.generar_mensualidades_jugadores_seguro(
  p_jugador_ids uuid[],
  p_mes integer,
  p_anio integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id     uuid;
  v_user_id     uuid;
  v_admin_nombre text;
  v_insertadas  integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Mes o año inválido';
  END IF;

  IF p_jugador_ids IS NULL OR cardinality(p_jugador_ids) > 1000 OR array_position(p_jugador_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Lista de jugadores inválida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_jugador_ids) AS input(jugador_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = input.jugador_id AND j.club_id = v_club_id)
  ) THEN RAISE EXCEPTION 'Uno o más jugadores no pertenecen al club'; END IF;

  -- El monto sale de la cuota del jugador y de ningún otro lado. Si no tiene,
  -- queda en NULL: es preferible una cuota visiblemente incompleta a una con
  -- una cifra que nadie decidió.
  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT DISTINCT v_club_id, j.id, p_mes, p_anio, 'pendiente', j.mensualidad
  FROM public.jugadores j
  JOIN unnest(p_jugador_ids) AS input(jugador_id) ON input.jugador_id = j.id
  WHERE j.club_id = v_club_id
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generar_mensualidades_jugadores_seguro(uuid[], integer, integer) FROM PUBLIC, anon;

COMMIT;


-- ── Verificación: quiénes quedarían sin monto al emitir ───────────────────
-- Conviene asignarles la cuota antes de emitir el mes.
SELECT nombre, coalesce(mensualidad::text, 'SIN CUOTA ASIGNADA') AS cuota
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND estado = 'activo'
  AND (es_externo IS NULL OR es_externo = false)
  AND mensualidad IS NULL
ORDER BY nombre;
