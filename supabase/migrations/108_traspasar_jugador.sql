-- CmSports — traspasar un jugador de un club a otro sin perder su historial
--
-- La app no ofrecía cambiar el club de un jugador: cuando pasaba, se editaba
-- la columna jugadores.club_id a mano en la base y quedaba a medias. Las
-- filas viejas de asistencia, mensualidades y clases extras seguían apuntando
-- al club anterior, y desde el club nuevo el jugador aparecía "sin historial"
-- aunque su plan y su horario ya estuvieran ahí. El caso que lo destapó fue
-- Daniel Torres, que se movió de Paine a Buin y no salía en la asistencia de
-- Buin.
--
-- Esta función mueve las tablas donde el par (jugador_id, club_id) tiene que
-- quedar consistente con el nuevo club. Deja intactas las tablas de auditoría
-- y el historial de horario: son diarios de lo que pasó en cada club y no se
-- reescriben. bloque_jugadores tampoco se toca, porque los bloques pertenecen
-- al club viejo: mudar la fila lo dejaría inscrito en un bloque que no
-- existe en el club nuevo. El admin del club nuevo lo inscribe en sus bloques.
--
-- Es idempotente: si ya se corrió, no vuelve a mover nada (los WHERE filtran
-- por club_id distinto del nuevo).
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

  -- Solo el superadmin puede mover un jugador entre clubes: cruza los límites
  -- del club, así que un admin de club no puede autorizarlo.
  SELECT rol INTO v_rol_actor FROM perfiles WHERE id = auth.uid();
  IF v_rol_actor IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadmin puede traspasar un jugador de club';
  END IF;

  SELECT club_id INTO v_club_id_viejo FROM jugadores WHERE id = p_jugador_id;
  IF v_club_id_viejo IS NULL THEN
    RAISE EXCEPTION 'Jugador % no existe', p_jugador_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = p_club_id_nuevo) THEN
    RAISE EXCEPTION 'Club de destino % no existe', p_club_id_nuevo;
  END IF;

  -- El propio jugador ya puede estar apuntando al club nuevo (el caso Daniel:
  -- se cambió a mano y ahora tocamos solo lo que quedó descolgado). Si no,
  -- también lo movemos: la función es la fuente única del traspaso.
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

-- Arreglo puntual: mover el historial de Daniel Torres a Buin.
-- El jugador ya está en Buin (jugadores.club_id se cambió a mano); esto ordena
-- las filas viejas que quedaron con el club anterior. Se busca por nombre y
-- por club actual para no chocar con un homónimo de otro club. Si el nombre
-- no calza (por acentos o algo por el estilo), no hace nada — el superadmin
-- puede correr la función desde la app cuando quiera.
DO $$
DECLARE
  v_club_buin  uuid;
  v_jugador    uuid;
BEGIN
  SELECT id INTO v_club_buin FROM clubes
    WHERE lower(nombre) LIKE '%buin%' LIMIT 1;
  IF v_club_buin IS NULL THEN RETURN; END IF;

  SELECT id INTO v_jugador FROM jugadores
    WHERE club_id = v_club_buin
      AND lower(nombre) LIKE 'daniel torres%'
    LIMIT 1;
  IF v_jugador IS NULL THEN RETURN; END IF;

  -- No pasa por la función porque la función exige superadmin autenticado y
  -- este bloque corre como el owner de la migración. La lógica es la misma.
  UPDATE asistencia SET club_id = v_club_buin
    WHERE jugador_id = v_jugador AND club_id IS DISTINCT FROM v_club_buin;
  UPDATE mensualidades SET club_id = v_club_buin
    WHERE jugador_id = v_jugador AND club_id IS DISTINCT FROM v_club_buin;
  UPDATE clases_extraordinarias SET club_id = v_club_buin
    WHERE jugador_id = v_jugador AND club_id IS DISTINCT FROM v_club_buin;
END $$;

COMMIT;
