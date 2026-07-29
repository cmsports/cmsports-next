-- CmSports — el admin y el profesor tambien pueden traspasar un jugador
--
-- La 108 dejo la funcion cerrada al superadmin. En la practica, el traspaso
-- entre clubes lo hacen el admin del club (y a veces el profesor) desde la
-- ficha del jugador: la vista del superadmin no es donde viven las fichas.
-- Esta migracion abre el permiso al staff. La funcion sigue moviendo lo
-- mismo (asistencia, mensualidades y clases extras) y sigue siendo idempotente.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.traspasar_jugador(
  p_jugador_id     uuid,
  p_club_id_nuevo  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actor      text;
  v_club_id_viejo  uuid;
BEGIN
  IF p_jugador_id IS NULL OR p_club_id_nuevo IS NULL THEN
    RAISE EXCEPTION 'Falta el jugador o el club de destino';
  END IF;

  -- Admin, profesor o superadmin pueden traspasar. El admin del club de
  -- origen es quien lo hace normalmente desde la ficha del jugador; el
  -- superadmin queda incluido para no perder el camino que ya tenia.
  SELECT rol INTO v_rol_actor FROM perfiles WHERE id = auth.uid();
  IF v_rol_actor NOT IN ('admin', 'profesor', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el admin, el profesor o el superadmin pueden traspasar un jugador';
  END IF;

  SELECT club_id INTO v_club_id_viejo FROM jugadores WHERE id = p_jugador_id;
  IF v_club_id_viejo IS NULL THEN
    RAISE EXCEPTION 'Jugador % no existe', p_jugador_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = p_club_id_nuevo) THEN
    RAISE EXCEPTION 'Club de destino % no existe', p_club_id_nuevo;
  END IF;

  UPDATE jugadores SET club_id = p_club_id_nuevo
    WHERE id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE asistencia SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE mensualidades SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE clases_extraordinarias SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;
END;
$$;

REVOKE ALL ON FUNCTION public.traspasar_jugador(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.traspasar_jugador(uuid, uuid) TO authenticated;

COMMIT;
