-- La migración 134 le agregó a eliminar_jugador_atomico un chequeo de "hay
-- que estar logueado". Correcto para bloquear a `anon`, pero se pasó de
-- estricto: eliminarClub (Next.js) borra un club completo llamando esta
-- función una vez por jugador con el cliente de SERVICIO (permiso elevado,
-- sin sesión de usuario) — necesita ese permiso para hacerlo en cadena, y esa
-- acción ya está protegida aparte por requireSuperadmin(). El cliente de
-- servicio no tiene auth.uid(): la 134 lo trataba igual que "nadie inició
-- sesión" y bloqueaba también ese camino legítimo, dejando "Eliminar club"
-- sin poder borrar ningún club con jugadores.
--
-- Se distingue con auth.role() = 'service_role': ese camino se salta el
-- chequeo (ya viene autorizado desde antes), todo lo demás sigue exigiendo
-- sesión y club como en la 134.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('135_fix_eliminar_jugador_permite_service_role');

CREATE OR REPLACE FUNCTION eliminar_jugador_atomico(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_club_actor    uuid;
  v_club_jugador  uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT rol, club_id INTO v_rol, v_club_actor FROM perfiles WHERE id = auth.uid();
    IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'Solo el administrador puede eliminar un jugador';
    END IF;

    SELECT club_id INTO v_club_jugador FROM jugadores WHERE id = p_jugador_id;
    IF v_club_jugador IS NULL THEN
      RAISE EXCEPTION 'Jugador no encontrado';
    END IF;
    IF v_rol <> 'superadmin' AND v_club_actor IS DISTINCT FROM v_club_jugador THEN
      RAISE EXCEPTION 'El jugador no es de este club';
    END IF;
  END IF;

  -- Referencias en otras entidades: se limpian, no se borran filas ajenas.
  UPDATE torneos SET cabeza_serie_1 = NULL WHERE cabeza_serie_1 = p_jugador_id;
  UPDATE torneos SET cabeza_serie_2 = NULL WHERE cabeza_serie_2 = p_jugador_id;
  UPDATE torneos SET campeon_id = NULL WHERE campeon_id = p_jugador_id;
  UPDATE torneos SET subcampeon_id = NULL WHERE subcampeon_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_primero_id = NULL WHERE desempate_primero_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_segundo_id = NULL WHERE desempate_segundo_id = p_jugador_id;

  UPDATE torneo_partidos
  SET jugador_a = CASE WHEN jugador_a = p_jugador_id THEN NULL ELSE jugador_a END,
      jugador_b = CASE WHEN jugador_b = p_jugador_id THEN NULL ELSE jugador_b END,
      ganador   = CASE WHEN ganador   = p_jugador_id THEN NULL ELSE ganador   END
  WHERE jugador_a = p_jugador_id OR jugador_b = p_jugador_id OR ganador = p_jugador_id;

  UPDATE partidos
  SET jugador_a = CASE WHEN jugador_a = p_jugador_id THEN NULL ELSE jugador_a END,
      jugador_b = CASE WHEN jugador_b = p_jugador_id THEN NULL ELSE jugador_b END,
      ganador   = CASE WHEN ganador   = p_jugador_id THEN NULL ELSE ganador   END
  WHERE jugador_a = p_jugador_id OR jugador_b = p_jugador_id OR ganador = p_jugador_id;

  UPDATE fotos_galeria SET jugador_id = NULL WHERE jugador_id = p_jugador_id;
  UPDATE liga_partidos SET arbitro_id = NULL WHERE arbitro_id = p_jugador_id;
  UPDATE liga_partidos SET ganador_id = NULL WHERE ganador_id = p_jugador_id;
  DELETE FROM liga_partidos WHERE jugador_a_id = p_jugador_id OR jugador_b_id = p_jugador_id;

  UPDATE movimientos SET jugador_id = NULL WHERE jugador_id = p_jugador_id;

  DELETE FROM asistencia WHERE jugador_id = p_jugador_id;
  DELETE FROM mensualidades WHERE jugador_id = p_jugador_id;
  DELETE FROM cuotas WHERE jugador_id = p_jugador_id;
  DELETE FROM evaluaciones_trimestrales WHERE jugador_id = p_jugador_id;
  DELETE FROM torneos_externos WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_pagos WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_felicitaciones WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_cabezas_serie WHERE jugador_id = p_jugador_id;
  DELETE FROM grupo_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM liga_jugador_pagos WHERE jugador_id = p_jugador_id;
  DELETE FROM liga_division_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM clases_extraordinarias WHERE jugador_id = p_jugador_id;
  DELETE FROM jugador_documentos WHERE jugador_id = p_jugador_id;
  DELETE FROM jugador_horario_historial WHERE jugador_id = p_jugador_id;
  DELETE FROM auditoria_asistencia WHERE jugador_id = p_jugador_id;
  DELETE FROM auditoria_mensualidades WHERE jugador_id = p_jugador_id;
  DELETE FROM bloque_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM perfiles WHERE jugador_id = p_jugador_id;

  DELETE FROM jugadores WHERE id = p_jugador_id;
END;
$$;

REVOKE ALL ON FUNCTION eliminar_jugador_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eliminar_jugador_atomico(uuid) TO authenticated;

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT prosrc ILIKE '%service_role%' AS distingue_service_role
FROM pg_proc WHERE proname = 'eliminar_jugador_atomico';
