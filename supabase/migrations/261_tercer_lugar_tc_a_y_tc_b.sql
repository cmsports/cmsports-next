-- 3er lugar de TC"A" y TCB, declarado por la administración del club.
--
-- Los dos torneos se jugaron ANTES de que existiera la mini llave por el 3er
-- lugar, así que el partido no está en el sistema. Estos puestos NO salen de un
-- partido registrado: los declaró el club el 2026-09-06.
--
--   TC"A"  3° Tomas Ignacio Ceballos Muñoz   ·  4° Javier Curimil
--   TCB    3° Benjamin Alonso Lobos Lizama   ·  4° Lucas Simón Ruiz Soto
--
-- En ambos casos los dos nombres son exactamente los que perdieron las
-- semifinales, y la migración lo VERIFICA antes de escribir: si el cuadro no
-- dice eso, aborta sin tocar nada.
--
-- Efecto: el ranking pasa a repartir 3° (80 pts) y 4° (70 pts) en vez de dejar
-- a los dos en 3-4 con 80. Requiere las migraciones 254 y 260 aplicadas, y el código desplegado.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('261_tercer_lugar_tc_a_y_tc_b');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');

DO $$
DECLARE
  v_club uuid := 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
  v_torneo uuid;
  v_tercero uuid;
  v_cuarto uuid;
  v_perdedores uuid[];
  v_caso record;
BEGIN
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'torneos' AND column_name = 'tercer_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta aplicar antes la migración 254_tercer_lugar_torneo_interno';
  END IF;

  FOR v_caso IN
    SELECT * FROM (VALUES
      -- torneo,                                  3er lugar,                              4to lugar
      ('bdad7b52-2ccd-43e1-a856-9bfa5e82b576'::uuid, 'd9020a4e-cc17-4c4f-9604-aee57c677a98'::uuid, '97e97328-74a3-4410-9602-375714696031'::uuid),
      ('15500fe8-112d-44ea-92d1-265d08024237'::uuid, '9573785a-20d0-4de7-8eed-2dfa5cfd8ff0'::uuid, 'f0784785-1975-46c8-8313-5c24eba6dd8a'::uuid)
    ) AS t(torneo_id, tercero_id, cuarto_id)
  LOOP
    v_torneo := v_caso.torneo_id;
    v_tercero := v_caso.tercero_id;
    v_cuarto := v_caso.cuarto_id;

    -- El torneo es de Buin y es interno.
    PERFORM 1 FROM public.torneos
    WHERE id = v_torneo AND club_id = v_club AND tipo = 'interno';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El torneo % no es un torneo interno de Buin', v_torneo;
    END IF;

    -- Nadie escribe un puesto que la cancha no dio: los dos nombres tienen que
    -- ser los que perdieron las semifinales de ese mismo cuadro.
    SELECT array_agg(perdedor ORDER BY perdedor) INTO v_perdedores
    FROM (
      SELECT CASE WHEN ganador = jugador_a THEN jugador_b ELSE jugador_a END AS perdedor
      FROM public.torneo_partidos
      WHERE torneo_id = v_torneo AND fase = 'semis'
        AND ganador IS NOT NULL AND jugador_a IS NOT NULL AND jugador_b IS NOT NULL
    ) s;

    IF v_perdedores IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[v_tercero, v_cuarto]) x) THEN
      RAISE EXCEPTION 'En el torneo % los perdedores de semis no son los dos declarados (son %)', v_torneo, v_perdedores;
    END IF;

    -- Y si ya existe la mini llave, no se pisa.
    PERFORM 1 FROM public.torneo_partidos
    WHERE torneo_id = v_torneo AND fase = 'tercer_lugar';
    IF FOUND THEN
      RAISE EXCEPTION 'El torneo % ya tiene partido por el 3er lugar', v_torneo;
    END IF;

    INSERT INTO public.torneo_partidos (torneo_id, fase, orden, jugador_a, jugador_b, ganador)
    VALUES (v_torneo, 'tercer_lugar', 0, v_cuarto, v_tercero, v_tercero);

    -- El podio guardado solo se completa en el torneo YA finalizado (TCB). En
    -- TC"A", que sigue abierto, lo va a escribir el botón "Finalizar torneo"
    -- junto con el campeón y el subcampeón.
    UPDATE public.torneos
    SET tercer_id = v_tercero
    WHERE id = v_torneo AND estado = 'finalizado';
  END LOOP;
END $$;

COMMIT;
