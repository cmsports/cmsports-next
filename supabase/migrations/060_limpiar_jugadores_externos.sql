-- Elimina jugadores externos de torneos finalizados
-- Los externos se acumulaban en la tabla jugadores al terminar un torneo
--
-- ⚠️ MIGRACIÓN ANULADA — NO VOLVER A EJECUTAR ⚠️
--
-- Esta migración borra `jugadores WHERE es_externo = TRUE` SIN filtrar por
-- club ni por torneo: si se repite hoy, se lleva a todos los externos de
-- todos los clubes de la plataforma, incluidos los inscritos en torneos en
-- curso y su club de procedencia (migración 126).
--
-- Ya no hace falta: desde la migración 061 existe `fn_limpiar_externos`, y
-- `finalizarTorneo` la llama sola al cerrar cada torneo, respetando campeón,
-- subcampeón y a quienes siguen inscritos en otro torneo.
--
-- Se anula por la misma razón que la 089: las migraciones de este proyecto se
-- pegan a mano en el SQL Editor y nada impedía repetirlas. Ver
-- docs/migraciones-destructivas.md.

DO $$
BEGIN
  RAISE EXCEPTION 'Migración 060 anulada: borra TODOS los jugadores externos de TODOS los clubes. La limpieza correcta la hace fn_limpiar_externos al finalizar cada torneo. Ver docs/migraciones-destructivas.md';
END $$;

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
