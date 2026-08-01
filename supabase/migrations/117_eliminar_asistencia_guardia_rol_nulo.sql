-- ────────────────────────────────────────────────────────────
-- Mismo defecto que ya se corrigió dos veces en este proyecto (092 y 093):
-- en SQL, `NULL NOT IN (...)` no es verdadero, es NULL. Un `IF` que evalúa
-- NULL no dispara. `eliminar_asistencia_segura` seguía con el guardia viejo:
--
--   IF v_perfil.club_id IS NULL OR v_perfil.rol NOT IN ('admin','profesor')
--
-- Si el perfil existe (club_id no es NULL) pero su `rol` quedó en NULL —ya
-- pasó al menos una vez en este proyecto, según el historial de 093—, la
-- comprobación completa da NULL y la función sigue de largo: ese usuario
-- podría borrar cualquier asistencia de su propio club sin ser admin ni
-- profesor. No cruza de club —hay un chequeo aparte para eso—, pero sí
-- salta el "solo admin o profesor".
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.eliminar_asistencia_segura(p_asistencia_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil record;
  v_asistencia record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT club_id, rol INTO v_perfil
  FROM public.perfiles
  WHERE id = v_uid;

  IF v_perfil.club_id IS NULL OR v_perfil.rol IS NULL OR v_perfil.rol NOT IN ('admin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o profesor puede eliminar asistencias';
  END IF;

  SELECT id, jugador_id, club_id INTO v_asistencia
  FROM public.asistencia
  WHERE id = p_asistencia_id
  FOR UPDATE;

  IF v_asistencia.id IS NULL OR v_asistencia.club_id IS DISTINCT FROM v_perfil.club_id THEN
    RAISE EXCEPTION 'Asistencia no encontrada';
  END IF;

  DELETE FROM public.asistencia WHERE id = p_asistencia_id;

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) - 1)
  WHERE id = v_asistencia.jugador_id;
END;
$$;
