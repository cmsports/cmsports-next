-- Permitir la fase 'tercer_lugar' en torneo_partidos.
--
-- La 254 enseñó la fase nueva a los dos RPC, pero la tabla tiene además un
-- CHECK sobre `fase` —`torneo_partidos_fase_check`— que la rechaza:
--
--   ERROR 23514: new row for relation "torneo_partidos" violates check
--   constraint "torneo_partidos_fase_check"
--
-- Ese CHECK no está en ninguna migración de este repo: entró con alguna de las
-- que se aplicaron desde otra parte (255 a 259). Por eso no aparecía al
-- revisar el repo y solo se vio al intentar la primera inserción.
--
-- Como no se sabe qué dice exactamente y no conviene adivinarlo, esta migración
-- NO reescribe la regla: lee la que hay y le AGREGA el valor nuevo. Lo que el
-- CHECK permitía ayer lo sigue permitiendo hoy, más 'tercer_lugar'.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('260_fase_tercer_lugar_permitida');
SELECT _migracion_para_todos_los_clubes('amplía un CHECK de esquema; no toca ninguna fila');

DO $$
DECLARE
  v_def text;
  v_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.torneo_partidos'::regclass
    AND conname = 'torneo_partidos_fase_check';

  -- Sin CHECK no hay nada que ampliar: la fase ya se puede insertar.
  IF v_def IS NULL THEN
    RAISE NOTICE 'No existe torneo_partidos_fase_check: nada que hacer.';
    RETURN;
  END IF;

  -- Ya la permite (por ejemplo, si esto se corre dos veces en otro entorno).
  IF v_def ILIKE '%tercer_lugar%' THEN
    RAISE NOTICE 'El CHECK ya permite tercer_lugar: nada que hacer.';
    RETURN;
  END IF;

  RAISE NOTICE 'CHECK anterior: %', v_def;

  -- pg_get_constraintdef devuelve "CHECK ((...))", a veces con " NOT VALID".
  -- Se extrae la expresión de adentro para conservarla tal cual.
  v_expr := regexp_replace(v_def, '\s+NOT VALID\s*$', '');
  v_expr := regexp_replace(v_expr, '^CHECK\s*\((.*)\)$', '\1');
  IF v_expr IS NULL OR v_expr = '' OR v_expr = v_def THEN
    RAISE EXCEPTION 'No se pudo leer la expresión del CHECK actual: %', v_def;
  END IF;

  ALTER TABLE public.torneo_partidos DROP CONSTRAINT torneo_partidos_fase_check;
  EXECUTE format(
    'ALTER TABLE public.torneo_partidos ADD CONSTRAINT torneo_partidos_fase_check CHECK (%s OR fase = %L)',
    v_expr, 'tercer_lugar');
END $$;

-- Comprobación: si la fase nueva sigue sin entrar, esto revienta y la
-- transacción se va entera, en vez de dejar el arreglo a medias.
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
  VALUES (v_torneo, 'tercer_lugar', 99999, NULL, NULL, NULL);
  DELETE FROM public.torneo_partidos
  WHERE torneo_id = v_torneo AND fase = 'tercer_lugar' AND orden = 99999;
  RAISE NOTICE 'Comprobado: la fase tercer_lugar ya se puede insertar.';
END $$;

COMMIT;
