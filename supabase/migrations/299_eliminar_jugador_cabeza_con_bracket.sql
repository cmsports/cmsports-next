-- Permite eliminar una ficha aunque sea cabeza de serie de un bracket.
-- Aplica a todos los clubes: corrige el orden interno de una función compartida.
-- No elimina datos al aplicar la migración; conserva permisos, auditoría,
-- movimientos financieros y el resto del borrado atómico existente.
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________

BEGIN;
SELECT _migracion_nueva('299_eliminar_jugador_cabeza_con_bracket');
SELECT _migracion_para_todos_los_clubes('corrige el orden del RPC compartido; no modifica filas al aplicar');

CREATE OR REPLACE FUNCTION eliminar_jugador_atomico(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol           text;
  v_club_actor    uuid;
  v_club_jugador  uuid;
  v_antes         jsonb;
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
  ELSE
    SELECT club_id INTO v_club_jugador FROM jugadores WHERE id = p_jugador_id;
    IF v_club_jugador IS NULL THEN
      RAISE EXCEPTION 'Jugador no encontrado';
    END IF;
  END IF;

  -- NUEVO: la ficha completa, ANTES de que se borre y no quede forma de
  -- recuperarla. Si algún día hay que reconstruir a alguien, esto es lo
  -- primero que hay que mirar — más confiable que rearmarlo desde una
  -- solicitud vieja, que fue lo que hubo que hacer esta vez.
  SELECT to_jsonb(j) INTO v_antes FROM jugadores j WHERE j.id = p_jugador_id;

  -- Mismo orden de bloqueo que configurar_cabezas_serie: torneo y luego
  -- cabezas. La tabla normalizada debe quedar limpia ANTES de actualizar
  -- las columnas legacy. Así el trigger reconoce que ya están sincronizadas
  -- y no interpreta la eliminación como un cambio de cabezas del bracket.
  PERFORM id FROM torneos
  WHERE cabeza_serie_1 = p_jugador_id OR cabeza_serie_2 = p_jugador_id
     OR id IN (SELECT torneo_id FROM torneo_cabezas_serie WHERE jugador_id = p_jugador_id)
  ORDER BY id FOR UPDATE;
  DELETE FROM torneo_cabezas_serie WHERE jugador_id = p_jugador_id;

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

  -- NUEVO: el rastro. Va DESPUÉS del DELETE y no antes: si algo de arriba
  -- fallara, toda la transacción se revierte junto con esto — no puede quedar
  -- un audit_log de un borrado que en realidad no pasó.
  INSERT INTO audit_log (club_id, entity_type, entity_id, action, before, user_id)
  VALUES (
    v_club_jugador, 'jugadores', p_jugador_id, 'eliminar', v_antes,
    CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
  );
END;
$$;

REVOKE ALL ON FUNCTION eliminar_jugador_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eliminar_jugador_atomico(uuid) TO authenticated;

COMMIT;

-- Verificación: ambos valores deben ser true.
SELECT
  strpos(prosrc, 'DELETE FROM torneo_cabezas_serie') <
    strpos(prosrc, 'UPDATE torneos SET cabeza_serie_1') AS limpia_cabezas_antes_del_legacy,
  prosrc ILIKE '%INSERT INTO audit_log%' AS conserva_auditoria
FROM pg_proc
WHERE oid = 'public.eliminar_jugador_atomico(uuid)'::regprocedure;
