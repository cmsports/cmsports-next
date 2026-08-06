-- eliminar_jugador_atomico rompía el check de torneo_partidos si el jugador
-- había ganado un partido.
--
-- La función soltaba las referencias en tres UPDATE separados:
--
--     UPDATE torneo_partidos SET jugador_a = NULL WHERE jugador_a = p_jugador_id;
--     UPDATE torneo_partidos SET jugador_b = NULL WHERE jugador_b = p_jugador_id;
--     UPDATE torneo_partidos SET ganador   = NULL WHERE ganador   = p_jugador_id;
--
-- Si el jugador era jugador_a Y ganador de ese partido, el primer UPDATE deja
-- la fila con jugador_a = NULL pero ganador todavía apuntando a él — Postgres
-- valida el check de inmediato, no al final de la transacción, así que
-- reventaba ahí mismo con "violates check constraint
-- torneo_partidos_ganador_participante_check" antes de llegar al tercer
-- UPDATE que lo habría arreglado.
--
-- Se juntan los tres en un solo UPDATE por fila: jugador_a, jugador_b y
-- ganador se sueltan a la vez, así el check nunca ve un estado a medio
-- terminar.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('132_eliminar_jugador_orden_partidos');

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

  -- jugador_a, jugador_b y ganador se sueltan en un solo UPDATE (ver
  -- encabezado): el check de que el ganador sea uno de los dos participantes
  -- se evalúa por fila apenas termina el statement, no al final de la
  -- transacción, así que no puede quedar a medio soltar entre dos UPDATE.
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

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT prosrc ILIKE '%CASE WHEN ganador%' AS arreglo_aplicado
FROM pg_proc WHERE proname = 'eliminar_jugador_atomico';
