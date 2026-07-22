-- Elimina jugadores externos de torneos finalizados
-- Los externos se acumulaban en la tabla jugadores al terminar un torneo

-- 1. Romper FK de perfiles que apunten a jugadores externos
UPDATE perfiles
SET jugador_id = NULL
WHERE jugador_id IN (
  SELECT id FROM jugadores WHERE es_externo = TRUE
);

-- 2. Borrar referencias en tablas dependientes
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

-- 3. Borrar registros de torneos donde participaron
DELETE FROM torneo_partidos
WHERE jugador_a IN (SELECT id FROM jugadores WHERE es_externo = TRUE)
   OR jugador_b  IN (SELECT id FROM jugadores WHERE es_externo = TRUE)
   OR ganador    IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

DELETE FROM grupo_jugadores
WHERE jugador_id IN (SELECT id FROM jugadores WHERE es_externo = TRUE);

-- 4. Finalmente borrar los jugadores externos
DELETE FROM jugadores WHERE es_externo = TRUE;
