-- Borrar un jugador ya no borra la plata que pasó por la caja.
--
-- `eliminar_jugador_atomico` (migración 114) hacía:
--
--     DELETE FROM movimientos WHERE jugador_id = p_jugador_id;
--
-- Eso reescribe meses ya cerrados: si alguien pagó $30.000 en julio y en
-- septiembre lo eliminan del sistema, julio pierde ese ingreso de forma
-- retroactiva. El balance de un mes contable no puede cambiar porque una
-- persona se dio de baja después; la plata entró igual.
--
-- Peor todavía, esos movimientos se iban sin respaldo y sin rastro en
-- `audit_log`, porque la función los borra directamente. Así desaparecieron
-- mensualidades de Buin sin que quedara forma de saber a quién pertenecían.
--
-- Ahora el movimiento se conserva y solo se le suelta la referencia al
-- jugador. La descripción ya trae el nombre ("Mensualidad Fulano — Julio
-- 2026"), así que el registro sigue siendo legible en Finanzas. El
-- `mensualidad_id` se limpia solo: su FK es ON DELETE SET NULL (migración
-- 039), y las mensualidades sí se borran unas líneas más arriba.
--
-- Limitación conocida: `auditoria_mensualidades.jugador_id` es NOT NULL con
-- ON DELETE CASCADE (migración 088), así que esa auditoría se sigue yendo con
-- el jugador. Cambiarlo pide tocar el esquema y queda para una migración
-- aparte; lo que importa —el movimiento de plata— ya queda protegido acá.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

CREATE OR REPLACE FUNCTION eliminar_jugador_atomico(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Referencias en otras entidades: se limpian, no se borran filas ajenas.
  UPDATE torneos SET cabeza_serie_1 = NULL WHERE cabeza_serie_1 = p_jugador_id;
  UPDATE torneos SET cabeza_serie_2 = NULL WHERE cabeza_serie_2 = p_jugador_id;
  UPDATE torneos SET campeon_id = NULL WHERE campeon_id = p_jugador_id;
  UPDATE torneos SET subcampeon_id = NULL WHERE subcampeon_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_primero_id = NULL WHERE desempate_primero_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_segundo_id = NULL WHERE desempate_segundo_id = p_jugador_id;
  UPDATE torneo_partidos SET jugador_a = NULL WHERE jugador_a = p_jugador_id;
  UPDATE torneo_partidos SET jugador_b = NULL WHERE jugador_b = p_jugador_id;
  UPDATE torneo_partidos SET ganador = NULL WHERE ganador = p_jugador_id;
  UPDATE partidos SET jugador_a = NULL WHERE jugador_a = p_jugador_id;
  UPDATE partidos SET jugador_b = NULL WHERE jugador_b = p_jugador_id;
  UPDATE partidos SET ganador = NULL WHERE ganador = p_jugador_id;
  UPDATE fotos_galeria SET jugador_id = NULL WHERE jugador_id = p_jugador_id;
  UPDATE liga_partidos SET arbitro_id = NULL WHERE arbitro_id = p_jugador_id;
  UPDATE liga_partidos SET ganador_id = NULL WHERE ganador_id = p_jugador_id;
  -- jugador_a_id/jugador_b_id son NOT NULL en liga_partidos: el partido se
  -- borra entero (arrastra también al rival de ese enfrentamiento puntual).
  -- Es una limitación del esquema ya existente (013_liga_mesa.sql), no algo
  -- nuevo de este borrado.
  DELETE FROM liga_partidos WHERE jugador_a_id = p_jugador_id OR jugador_b_id = p_jugador_id;

  -- La plata NO se borra: el movimiento queda, sin dueño. Un mes ya cerrado
  -- no puede cambiar de saldo porque alguien se dio de baja después.
  UPDATE movimientos SET jugador_id = NULL WHERE jugador_id = p_jugador_id;

  -- Filas que le pertenecen al jugador: se borran completas.
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

GRANT EXECUTE ON FUNCTION eliminar_jugador_atomico(uuid) TO authenticated;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe devolver 0: ya no queda ningún DELETE sobre movimientos en la función.
SELECT count(*) AS borra_movimientos_todavia
FROM pg_proc
WHERE proname = 'eliminar_jugador_atomico'
  AND prosrc ILIKE '%DELETE FROM movimientos%';
