-- Borra las fichas externas (es_externo = true) de Asociación TDM Buin y Paine
-- que NO tienen nada colgando: son pruebas de agosto, relleno numerado "1".."17"
-- y visitas de torneos viejos cuyas inscripciones ya se limpiaron. Aparecían en
-- Asistencia como candidatos a clase extra.
--
-- Se quedan fuera a propósito (se ven aparte):
--   * las que tienen algo colgando en cualquier tabla de abajo (torneos,
--     partidos, pagos, clases extra...);
--   * las que tienen RUT (puede ser un alumno real marcado como externo);
--   * las creadas desde el 2026-11-01 (los "18".."60": no sabemos qué son).
--
-- Reglas de docs/migraciones-destructivas.md: respaldo con nombre único y sin
-- IF NOT EXISTS, condición escrita UNA vez, conteo esperado contra el real,
-- una sola transacción y verificación al final.
-- EJECUCIÓN MANUAL: SQL Editor de Supabase. Aplicada el: 2026-11-03
-- Resultado: 126 respaldadas en _respaldo_externos_308_20261103, 0 siguen en
-- jugadores, 100 externos activos que quedan (con algo colgando, con RUT o
-- creados desde el 2026-11-01).
BEGIN;
DO $$
BEGIN
  RAISE EXCEPTION 'Migración 308 anulada: ya se ejecutó. No repetir.';
END $$;
SELECT _migracion_nueva('308_borrar_fichas_externas_sin_uso_buin');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');

-- 1. Respaldo (fila completa). Si ya existe, la migración se cae acá.
CREATE TABLE public._respaldo_externos_308_20261103 AS
SELECT j.*
FROM public.jugadores j
WHERE j.club_id = _migracion_para_club('Asociación TDM Buin y Paine')
  AND j.estado = 'activo'
  AND j.es_externo = true
  AND j.rut IS NULL
  AND j.creado_en::date < DATE '2026-11-01'
  AND NOT EXISTS (SELECT 1 FROM public.asistencia x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.auditoria_asistencia x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.auditoria_mensualidades x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.bloque_jugadores x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.clases_extraordinarias x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.cuotas x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.evaluaciones_trimestrales x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.fotos_galeria x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.grupo_jugadores x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.jugador_documentos x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.jugador_horario_historial x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.liga_division_jugadores x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.liga_jugador_pagos x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.liga_partidos x
                  WHERE j.id IN (x.jugador_a_id, x.jugador_b_id, x.ganador_id, x.arbitro_id))
  AND NOT EXISTS (SELECT 1 FROM public.mensualidades x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.movimientos x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.partidos x
                  WHERE j.id IN (x.jugador_a, x.jugador_b, x.ganador))
  AND NOT EXISTS (SELECT 1 FROM public.perfiles x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneo_cabezas_serie x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneo_felicitaciones x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneo_grupos x
                  WHERE j.id IN (x.desempate_primero_id, x.desempate_segundo_id))
  AND NOT EXISTS (SELECT 1 FROM public.torneo_jugadores x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneo_pagos x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneo_partidos x
                  WHERE j.id IN (x.jugador_a, x.jugador_b, x.ganador))
  AND NOT EXISTS (SELECT 1 FROM public.torneos_externos x WHERE x.jugador_id = j.id)
  AND NOT EXISTS (SELECT 1 FROM public.torneos x
                  WHERE j.id IN (x.campeon_id, x.subcampeon_id, x.cabeza_serie_1, x.cabeza_serie_2));

-- 2. El número tiene que calzar con lo que mostró la consulta de dependencias
--    (126 fichas con total_colgando = 0, sin RUT y anteriores al 2026-11-01).
--    Después se borra solo lo respaldado y se vuelve a contar.
DO $$
DECLARE
  v_esperado constant int := 126;
  v_respaldadas int;
  v_borradas int;
BEGIN
  SELECT count(*) INTO v_respaldadas FROM public._respaldo_externos_308_20261103;
  IF v_respaldadas <> v_esperado THEN
    RAISE EXCEPTION 'Migración 308: el respaldo tiene % fichas y se esperaban %. No se borró nada.',
      v_respaldadas, v_esperado;
  END IF;

  DELETE FROM public.jugadores
  WHERE id IN (SELECT id FROM public._respaldo_externos_308_20261103)
    AND club_id = _migracion_para_club('Asociación TDM Buin y Paine')
    AND es_externo = true;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  IF v_borradas <> v_esperado THEN
    RAISE EXCEPTION 'Migración 308: se borraron % fichas y se esperaban %. Se revierte todo.',
      v_borradas, v_esperado;
  END IF;
END $$;

-- 3. Verificación: borradas = respaldadas, y ninguna del respaldo sigue en jugadores.
SELECT
  (SELECT count(*) FROM public._respaldo_externos_308_20261103) AS respaldadas,
  (SELECT count(*) FROM public.jugadores j
   WHERE j.id IN (SELECT id FROM public._respaldo_externos_308_20261103)) AS siguen_en_jugadores,
  (SELECT count(*) FROM public.jugadores
   WHERE club_id = _migracion_para_club('Asociación TDM Buin y Paine')
     AND estado = 'activo' AND es_externo = true) AS externos_activos_que_quedan;

COMMIT;
