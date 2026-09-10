-- El CHECK de fases rechaza dos fases que el código ya sabe generar.
--
-- Este cambio afecta a: TODOS los clubes. No es de Spinhouse ni de una
-- funcionalidad nueva: arregla un bug latente que hoy está en producción.
--
-- ══ El bug ════════════════════════════════════════════════════════════════
--
-- `torneo_partidos_fase_check` permite hoy, exactamente:
--
--     grupos · 16vos · 8vos · cuartos · semis · final · tercer_lugar
--
-- Y `CONFIG.FASES_ORDEN` (src/lib/config.ts:18) es:
--
--     avance · 32vos · 16vos · 8vos · cuartos · semis · final
--
-- Faltan **avance** y **32vos**, y una de las dos es alcanzable hoy:
--
--   · `determinarFaseInicial()` devuelve '32vos' para todo cuadro mayor a 32
--     (src/lib/domain/torneos.ts:1326).
--   · `TORNEO_MAX_GRUPOS` es 32 y clasifican 2 por grupo, o sea hasta 64.
--   · `calcularNumGrupos()` es ceil(N/3), así que con 49 jugadores ya son 17
--     grupos → 34 clasificados → cuadro de 64 → fase inicial '32vos'.
--
-- **Un torneo de 49 jugadores o más revienta al armar las llaves** con
-- ERROR 23514. Y no revienta al crearlo ni al cerrar la inscripción: revienta
-- en `sincronizarLlaves`, o sea el día del torneo, con los grupos ya jugados.
--
-- No mordió todavía porque ningún club llegó a ese tamaño. Spinhouse tiene 140
-- jugadores inscritos, así que deja de ser hipotético.
--
-- 'avance' no es alcanzable hoy —esa ronda está reservada en FASES_ORDEN y
-- nunca se generó—, pero entra igual: el día que se implemente, el bug sería
-- idéntico.
--
-- ══ Por qué acá SÍ se reescribe la regla, y en la 260 no ══════════════════
--
-- La 260 no reescribió el CHECK porque no sabía qué decía: lo leyó con
-- `pg_get_constraintdef()` y le AGREGÓ un valor, para no perder lo que
-- permitiera. Hoy sí se conoce, verificado contra producción el 2026-09-09:
--
--   CHECK (((fase = ANY (ARRAY['grupos','16vos','8vos','cuartos','semis',
--           'final'])) OR (fase = 'tercer_lugar')))
--
-- Sabiendo eso, escribirlo completo es mejor que encadenar otro OR: la regla
-- queda legible y la lista se lee de un vistazo contra FASES_ORDEN, que es
-- justamente la comparación que no se hizo y por eso apareció el bug.
--
-- Antes de reemplazarlo se comprueba que ninguna fila existente quede fuera de
-- la lista nueva. Si alguna queda, la migración aborta entera y no cambia nada.
--
-- `fase` es nullable y sigue siéndolo: un CHECK sobre NULL da NULL, no FALSE,
-- así que las filas sin fase pasan igual que antes.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-09

BEGIN;
SELECT _migracion_nueva('263_fases_del_cuadro_completas');
SELECT _migracion_para_todos_los_clubes(
  'amplía un CHECK de esquema para aceptar dos fases que el código ya genera; no toca ninguna fila');

-- 1) Ninguna fila puede quedar fuera de la lista nueva.
DO $$
DECLARE
  v_fuera text;
BEGIN
  SELECT string_agg(DISTINCT fase, ', ') INTO v_fuera
  FROM public.torneo_partidos
  WHERE fase IS NOT NULL
    AND fase NOT IN ('grupos', 'avance', '32vos', '16vos', '8vos',
                     'cuartos', 'semis', 'final', 'tercer_lugar');

  IF v_fuera IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay partidos con fases fuera de la lista nueva: %. Revisar antes de aplicar.', v_fuera;
  END IF;
END $$;

-- 2) La regla, completa y en el mismo orden que CONFIG.FASES_ORDEN.
ALTER TABLE public.torneo_partidos
  DROP CONSTRAINT IF EXISTS torneo_partidos_fase_check;
ALTER TABLE public.torneo_partidos
  ADD CONSTRAINT torneo_partidos_fase_check
  CHECK (fase IN ('grupos', 'avance', '32vos', '16vos', '8vos',
                  'cuartos', 'semis', 'final', 'tercer_lugar'));

-- 3) Comprobación: la fase que hoy revienta un torneo de 49+ ahora entra.
--    Se inserta y se borra dentro de la transacción; si el CHECK la rechazara,
--    esto lanza y la migración entera se va.
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
  VALUES (v_torneo, '32vos', 99998, NULL, NULL, NULL),
         (v_torneo, 'avance', 99997, NULL, NULL, NULL);

  DELETE FROM public.torneo_partidos
  WHERE torneo_id = v_torneo AND orden IN (99997, 99998) AND fase IN ('32vos', 'avance');

  RAISE NOTICE 'Comprobado: 32vos y avance ya se pueden insertar.';
END $$;

COMMIT;
