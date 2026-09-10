-- Las fases de los cuadros grandes: 64vos y 128vos, y sus espejos de consuelo.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Amplía la lista de fases que `torneo_partidos` acepta. No
-- toca una sola fila.
--
-- ══ El bug que arregla ════════════════════════════════════════════════════
--
-- `CONFIG.FASES_ORDEN` empezaba en '32vos', y `determinarFaseInicial()`
-- devuelve la primera fase que cubre el tamaño del cuadro. Como no había nada
-- más arriba, TODO cuadro mayor a 64 caía igual en '32vos' y el camino quedaba
-- corto:
--
--   65 inscritos  → cuadro de 128 → llegaba a 'final' con DOS partidos
--   129 inscritos → cuadro de 256 → llegaba a 'final' con CUATRO
--
-- O sea: el torneo terminaba con dos campeones y no daba un solo error. Lo
-- encontró la auditoría del 2026-09-10, simulando el ciclo de vida completo en
-- vez de mirar cada formato por dentro.
--
-- El torneo tradicional se salvaba por accidente: `TORNEO_MAX_CLASIFICADOS`
-- limita el cuadro a 64. La que se rompía era la eliminación directa, que
-- arma el cuadro desde la inscripción y no tenía ese techo — justamente la que
-- se acaba de entregar para Spinhouse, que tiene 140 jugadores.
--
-- Con '64vos' y '128vos' el cuadro llega hasta 256 inscritos. El código además
-- valida el borde antes de generar (`MAX_JUGADORES_EN_CUADRO`), para que un
-- torneo más grande se rechace al cerrar la inscripción y no el día del
-- torneo.
--
-- ══ Se reescribe la lista, como en la 263 y la 265 ════════════════════════
--
-- El CHECK lo escribió este repo en la 265, así que se conoce. Igual se
-- comprueba primero que ninguna fila quede fuera: si alguien aplicó algo por
-- afuera entre medio, esto aborta en vez de fallar el ALTER a mitad.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('267_fases_de_cuadros_grandes');
SELECT _migracion_para_todos_los_clubes(
  'amplía un CHECK de esquema con las fases de los cuadros de 128 y 256; no toca ninguna fila');

-- 1) Ninguna fila existente puede quedar fuera de la lista nueva.
DO $$
DECLARE
  v_fuera text;
BEGIN
  SELECT string_agg(DISTINCT fase, ', ') INTO v_fuera
  FROM public.torneo_partidos
  WHERE fase IS NOT NULL
    AND fase NOT IN ('grupos', 'avance', '128vos', '64vos', '32vos', '16vos', '8vos',
                     'cuartos', 'semis', 'final', 'tercer_lugar',
                     'cons_avance', 'cons_128vos', 'cons_64vos', 'cons_32vos',
                     'cons_16vos', 'cons_8vos', 'cons_cuartos', 'cons_semis', 'cons_final');

  IF v_fuera IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay partidos con fases fuera de la lista nueva: %. Revisar antes de aplicar.', v_fuera;
  END IF;
END $$;

-- 2) El camino completo del cuadro, y su espejo de consuelo.
ALTER TABLE public.torneo_partidos
  DROP CONSTRAINT IF EXISTS torneo_partidos_fase_check;
ALTER TABLE public.torneo_partidos
  ADD CONSTRAINT torneo_partidos_fase_check
  CHECK (fase IN ('grupos', 'avance', '128vos', '64vos', '32vos', '16vos', '8vos',
                  'cuartos', 'semis', 'final', 'tercer_lugar',
                  'cons_avance', 'cons_128vos', 'cons_64vos', 'cons_32vos',
                  'cons_16vos', 'cons_8vos', 'cons_cuartos', 'cons_semis', 'cons_final'));

-- 3) Y los encuentros por equipos, que tienen su propio CHECK de fase (266).
ALTER TABLE public.torneo_encuentros
  DROP CONSTRAINT IF EXISTS torneo_encuentros_fase_check;
ALTER TABLE public.torneo_encuentros
  ADD CONSTRAINT torneo_encuentros_fase_check
  CHECK (fase IN ('grupos', 'avance', '128vos', '64vos', '32vos', '16vos', '8vos',
                  'cuartos', 'semis', 'final', 'tercer_lugar'));

-- 4) Comprobación: las fases nuevas entran y las viejas siguen entrando.
DO $$
DECLARE
  v_torneo uuid;
BEGIN
  SELECT id INTO v_torneo FROM public.torneos LIMIT 1;
  IF v_torneo IS NULL THEN
    RAISE NOTICE 'No hay torneos para la comprobación; se omite.';
    RETURN;
  END IF;

  INSERT INTO public.torneo_partidos (torneo_id, fase, orden, jugador_a, jugador_b, ganador)
  VALUES (v_torneo, '64vos', 99993, NULL, NULL, NULL),
         (v_torneo, '128vos', 99992, NULL, NULL, NULL),
         (v_torneo, 'cons_64vos', 99991, NULL, NULL, NULL),
         (v_torneo, 'final', 99990, NULL, NULL, NULL);

  DELETE FROM public.torneo_partidos
  WHERE torneo_id = v_torneo AND orden BETWEEN 99990 AND 99993;

  RAISE NOTICE 'Comprobado: las fases de cuadros grandes ya se pueden insertar.';
END $$;

COMMIT;
