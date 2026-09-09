-- Las fases del cuadro de consolación.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Amplía la lista de fases que `torneo_partidos` acepta. No
-- toca una sola fila y nadie inserta estas fases todavía: las genera la
-- modalidad `eliminacion_consolacion`, que solo existe con el módulo encendido.
--
-- ══ Por qué el consuelo necesita fases propias ════════════════════════════
--
-- `torneo_partidos` tiene un índice único sobre (torneo_id, fase, orden) —de
-- ahí sale el manejo del error 23505 al propagar un ganador—. Si el cuadro de
-- consuelo usara los mismos nombres de fase que el principal, sus partidos
-- competirían por el mismo slot y la mitad no entraría.
--
-- Por eso `cons_*`: son un cuadro aparte, con su propia final y su propio
-- campeón, y el prefijo los separa sin ambigüedad. `esFaseDeConsolacion()` en
-- src/lib/domain/torneoConsolacion.ts es la contraparte en el código.
--
-- ══ Se reescribe la lista completa, como en la 263 ════════════════════════
--
-- La 260 tuvo que leer el CHECK con `pg_get_constraintdef()` y agregarle un
-- valor sin pisarlo, porque nadie sabía qué decía. Desde la 263 sí se sabe: la
-- escribió este repo, y dice exactamente
--
--   CHECK (fase IN ('grupos','avance','32vos','16vos','8vos','cuartos',
--                   'semis','final','tercer_lugar'))
--
-- Así que acá se vuelve a escribir entera, con las siete de consuelo sumadas.
-- Igual se comprueba primero que ninguna fila quede fuera: si alguien aplicó
-- algo por afuera del repo entre medio, esto aborta en vez de fallar el ALTER.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('265_fases_del_cuadro_de_consuelo');
SELECT _migracion_para_todos_los_clubes(
  'amplía un CHECK de esquema con las fases del cuadro de consolación; no toca ninguna fila');

-- 1) Ninguna fila existente puede quedar fuera de la lista nueva.
DO $$
DECLARE
  v_fuera text;
BEGIN
  SELECT string_agg(DISTINCT fase, ', ') INTO v_fuera
  FROM public.torneo_partidos
  WHERE fase IS NOT NULL
    AND fase NOT IN ('grupos', 'avance', '32vos', '16vos', '8vos',
                     'cuartos', 'semis', 'final', 'tercer_lugar',
                     'cons_avance', 'cons_32vos', 'cons_16vos', 'cons_8vos',
                     'cons_cuartos', 'cons_semis', 'cons_final');

  IF v_fuera IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay partidos con fases fuera de la lista nueva: %. Revisar antes de aplicar.', v_fuera;
  END IF;
END $$;

-- 2) El cuadro principal y su espejo de consuelo, en el mismo orden.
ALTER TABLE public.torneo_partidos
  DROP CONSTRAINT IF EXISTS torneo_partidos_fase_check;
ALTER TABLE public.torneo_partidos
  ADD CONSTRAINT torneo_partidos_fase_check
  CHECK (fase IN ('grupos', 'avance', '32vos', '16vos', '8vos',
                  'cuartos', 'semis', 'final', 'tercer_lugar',
                  'cons_avance', 'cons_32vos', 'cons_16vos', 'cons_8vos',
                  'cons_cuartos', 'cons_semis', 'cons_final'));

-- 3) Comprobación: las fases nuevas entran y las viejas siguen entrando.
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
  VALUES (v_torneo, 'cons_final', 99996, NULL, NULL, NULL),
         (v_torneo, 'cons_8vos', 99995, NULL, NULL, NULL),
         (v_torneo, 'final', 99994, NULL, NULL, NULL);

  DELETE FROM public.torneo_partidos
  WHERE torneo_id = v_torneo AND orden IN (99994, 99995, 99996);

  RAISE NOTICE 'Comprobado: las fases de consuelo ya se pueden insertar.';
END $$;

COMMIT;
