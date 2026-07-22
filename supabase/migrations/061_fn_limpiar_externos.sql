-- Función para limpiar jugadores externos tras torneos finalizados
CREATE OR REPLACE FUNCTION limpiar_jugadores_externos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Romper FK de perfiles
  UPDATE perfiles SET jugador_id = NULL
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  -- 2. Borrar dependencias
  DELETE FROM torneo_felicitaciones
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM asistencia
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM clase_jugadores
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM reservas
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM mensualidades
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM torneo_partidos
  WHERE jugador_a IN (SELECT id FROM jugadores WHERE es_externo = TRUE)
     OR jugador_b  IN (SELECT id FROM jugadores WHERE es_externo = TRUE)
     OR ganador    IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  DELETE FROM grupo_jugadores
  WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

  -- 3. Borrar los jugadores externos
  DELETE FROM jugadores WHERE es_externo = TRUE;
END;
$$;
