-- ────────────────────────────────────────────────────────────
-- `eliminar_jugador_atomico` pasa a dejar rastro en `audit_log`.
--
-- Este cambio aplica a TODOS los clubes: la función es de esquema, no de
-- Buin en particular — pero nace justo del caso de Sebastián González en
-- Buin (2026-09-01): se borró su ficha y no había forma de saber quién lo
-- hizo ni cuándo, porque esta función —a diferencia de casi todas las demás
-- que tocan datos importantes— nunca quedó con auditoría. Se reconstruyó a
-- mano en la migración 244 a partir de su solicitud, que por suerte
-- sobrevivió.
--
-- ── Qué guarda ─────────────────────────────────────────────────────────────
-- Antes de borrar, guarda en `before` los datos que de otra forma se pierden
-- para siempre: nombre, rut, email, teléfono, categoría, plan, mensualidad,
-- estado. `user_id` es quien ejecutó el borrado — NULL cuando lo hizo el
-- cliente de servicio (por ejemplo, al borrar un club completo), que es un
-- camino ya autorizado aparte y sin un usuario humano detrás.
--
-- No cambia nada del comportamiento de borrar: mismos chequeos de rol y club,
-- mismas tablas que se limpian. Solo se le agrega el rastro.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('245_eliminar_jugador_deja_rastro');

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

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────

-- 1) La función quedó con el INSERT nuevo.
SELECT prosrc ILIKE '%INSERT INTO audit_log%' AS deja_rastro
FROM pg_proc WHERE proname = 'eliminar_jugador_atomico';

-- 2) Prueba real: borrar un jugador de prueba (uno que de verdad se pueda
-- borrar) y confirmar que aparece acá, con su ficha completa en `before`:
-- SELECT * FROM audit_log
-- WHERE entity_type = 'jugadores' AND action = 'eliminar'
-- ORDER BY created_at DESC LIMIT 5;
