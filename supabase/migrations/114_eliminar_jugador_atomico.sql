-- Antes eliminarJugador hacía un DELETE simple sobre `jugadores`, que fallaba
-- con foreign key violation apenas el jugador tenía asistencia, mensualidades,
-- pagos de torneo/liga, etc. (la mayoría de esas tablas no tiene ON DELETE
-- CASCADE). El error de Postgres se tragaba y se mostraba un mensaje genérico,
-- sin borrar nada.
--
-- Esta función borra en una sola transacción todo lo que le pertenece al
-- jugador, y en las tablas de otras entidades (torneos, partidos, liga) que
-- solo lo mencionan como rival/árbitro/campeón/cabeza de serie, deja la
-- columna en NULL en vez de borrar la fila completa (no se destruye el
-- historial de otro jugador). Sigue el mismo criterio que ya usó el equipo en
-- la migración 081 para el mismo problema.
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

  -- Filas que le pertenecen al jugador: se borran completas.
  DELETE FROM asistencia WHERE jugador_id = p_jugador_id;
  DELETE FROM mensualidades WHERE jugador_id = p_jugador_id;
  DELETE FROM cuotas WHERE jugador_id = p_jugador_id;
  DELETE FROM movimientos WHERE jugador_id = p_jugador_id;
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
