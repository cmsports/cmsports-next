-- Datos de prueba del piloto técnico Spinhouse:
-- ~3 meses de sesiones, eventos y evaluaciones para Matías y Valentina.
-- Sin archivos de video (las métricas no los requieren).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Alcance: solo Spinhouse. No toca Buin ni otros clubes.
-- Requiere: jugadores demo (144/148), objetivos (146), plan demo (152).

BEGIN;
SELECT _migracion_nueva('174_datos_piloto_3meses_spinhouse');

DO $$
DECLARE
  v_club   uuid := '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
  v_plan   uuid := 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
  v_matias uuid := '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40';
  v_valen  uuid := '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19';
  v_hoy    date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_inicio date := v_hoy - 90;

  v_ej uuid[] ;
  v_obj_ids uuid[];
  v_obj_codigos text[];
  v_obj_nombres text[];

  r_jugador record;
  v_fecha date;
  v_semana int;
  v_sesion_id uuid;
  v_eval_id uuid;
  v_tipo text;
  v_titulo text;
  v_ejercicio uuid;
  v_n_eventos int;
  v_i int;
  v_ts int;
  v_golpe text;
  v_resultado text;
  v_zona int;
  v_roll numeric;
  v_progreso numeric; -- 0 temprano → 1 reciente
  v_err_bias numeric;
  v_win_bias numeric;
  v_item_estado text;
  v_resumen text;
  v_seed double precision;
  v_dias int[];
  v_dia_offset int;
  v_obj_idx int;
  v_n_objs int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = v_matias AND club_id = v_club) THEN
    RAISE EXCEPTION 'Falta jugador demo Matías (migración 144)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = v_valen AND club_id = v_club) THEN
    RAISE EXCEPTION 'Falta jugador demo Valentina (migración 148)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tecnico_planes WHERE id = v_plan AND club_id = v_club) THEN
    RAISE EXCEPTION 'Falta plan demo (migración 152)';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY orden), ARRAY[]::uuid[])
  INTO v_ej
  FROM tecnico_plan_ejercicios
  WHERE plan_id = v_plan AND club_id = v_club;

  IF coalesce(array_length(v_ej, 1), 0) < 1 THEN
    RAISE EXCEPTION 'El plan demo no tiene ejercicios';
  END IF;

  SELECT
    coalesce(array_agg(id ORDER BY codigo), ARRAY[]::uuid[]),
    coalesce(array_agg(codigo ORDER BY codigo), ARRAY[]::text[]),
    coalesce(array_agg(nombre ORDER BY codigo), ARRAY[]::text[])
  INTO v_obj_ids, v_obj_codigos, v_obj_nombres
  FROM tecnico_objetivos
  WHERE club_id = v_club
    AND activo
    AND codigo IN ('SER-CONTROL', 'DER-CONS', 'REV-CONS', 'DESP-REC', 'BLQ-TIEMPO');

  v_n_objs := coalesce(array_length(v_obj_ids, 1), 0);
  IF v_n_objs < 3 THEN
    RAISE EXCEPTION 'Faltan objetivos técnicos de la migración 146';
  END IF;

  -- Plan asignado desde el inicio del piloto.
  UPDATE tecnico_plan_jugadores
  SET fecha_inicio = v_inicio,
      estado = 'en_curso',
      fecha_fin = NULL,
      notas = coalesce(notas, 'Asignación demo del piloto')
  WHERE club_id = v_club
    AND plan_id = v_plan
    AND jugador_id IN (v_matias, v_valen)
    AND estado <> 'archivado';

  -- Objetivos activos por jugador (idempotente por jugador+objetivo pendiente/en_progreso).
  FOR r_jugador IN
    SELECT * FROM (VALUES (v_matias), (v_valen)) AS t(id)
  LOOP
    FOR v_obj_idx IN 1..least(v_n_objs, 4) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM tecnico_jugador_objetivos
        WHERE club_id = v_club
          AND jugador_id = r_jugador.id
          AND objetivo_id = v_obj_ids[v_obj_idx]
          AND estado IN ('pendiente', 'en_progreso', 'logrado')
      ) THEN
        INSERT INTO tecnico_jugador_objetivos (
          club_id, jugador_id, objetivo_id, estado, fecha_inicio, notas
        ) VALUES (
          v_club,
          r_jugador.id,
          v_obj_ids[v_obj_idx],
          CASE WHEN v_obj_idx <= 2 THEN 'en_progreso' ELSE 'pendiente' END,
          v_inicio,
          'Seed piloto 153'
        );
      END IF;
    END LOOP;
  END LOOP;

  FOR r_jugador IN
    SELECT * FROM (VALUES
      (v_matias, 0.11::float8, 'Matías'),
      (v_valen,  0.37::float8, 'Valentina')
    ) AS t(id, seed, etiqueta)
  LOOP
    v_seed := r_jugador.seed;
    PERFORM setseed(v_seed);

    -- Dos entrenamientos por semana (mar/jue) + ocasional competencia/análisis.
    FOR v_semana IN 0..12 LOOP
      v_dias := ARRAY[1, 3]; -- +1 y +3 días desde el lunes de esa semana relativa
      FOREACH v_dia_offset IN ARRAY v_dias LOOP
        v_fecha := v_inicio + (v_semana * 7) + v_dia_offset;
        IF v_fecha > v_hoy THEN
          CONTINUE;
        END IF;

        v_progreso := greatest(0, least(1, (v_fecha - v_inicio)::numeric / 90.0));
        -- Matías arranca un poco mejor; ambos mejoran con el tiempo.
        IF r_jugador.id = v_matias THEN
          v_err_bias := 0.22 - (v_progreso * 0.12);
          v_win_bias := 0.42 + (v_progreso * 0.18);
        ELSE
          v_err_bias := 0.26 - (v_progreso * 0.10);
          v_win_bias := 0.36 + (v_progreso * 0.16);
        END IF;

        v_roll := random();
        IF v_roll < 0.12 THEN
          v_tipo := 'competencia';
          v_titulo := format('Torneo interno · %s', to_char(v_fecha, 'DD/MM'));
          v_ejercicio := NULL;
        ELSIF v_roll < 0.28 THEN
          v_tipo := 'analisis_video';
          v_titulo := format('Análisis de video · %s', to_char(v_fecha, 'DD/MM'));
          v_ejercicio := NULL;
        ELSE
          v_tipo := 'entrenamiento';
          v_ejercicio := v_ej[1 + floor(random() * array_length(v_ej, 1))::int];
          SELECT nombre INTO v_titulo
          FROM tecnico_plan_ejercicios
          WHERE id = v_ejercicio;
          v_titulo := coalesce(v_titulo, 'Entrenamiento') || ' · ' || to_char(v_fecha, 'DD/MM');
        END IF;

        INSERT INTO tecnico_sesiones (
          club_id, jugador_id, titulo, tipo, estado, fecha, notas,
          plan_id, ejercicio_id,
          rival_nombre, competencia_nombre, marcador,
          publicada_en
        ) VALUES (
          v_club,
          r_jugador.id,
          v_titulo,
          v_tipo,
          'publicada',
          v_fecha,
          'seed-piloto-153',
          CASE WHEN v_tipo = 'entrenamiento' THEN v_plan ELSE NULL END,
          v_ejercicio,
          CASE WHEN v_tipo = 'competencia' THEN
            (ARRAY['Rival A','Rival B','Rival C','Club Norte','Spinhouse B'])[1 + floor(random()*5)::int]
          ELSE NULL END,
          CASE WHEN v_tipo = 'competencia' THEN 'Copa piloto Spinhouse' ELSE NULL END,
          CASE WHEN v_tipo = 'competencia' THEN
            format('%s-%s', 2 + floor(random()*2)::int, 1 + floor(random()*2)::int)
          ELSE NULL END,
          (v_fecha + time '18:30') AT TIME ZONE 'America/Santiago'
        )
        RETURNING id INTO v_sesion_id;

        v_n_eventos := 16 + floor(random() * 18)::int; -- 16..33
        v_ts := 8000 + floor(random() * 4000)::int;

        FOR v_i IN 1..v_n_eventos LOOP
          v_roll := random();
          IF v_roll < v_err_bias THEN
            v_golpe := 'ERR';
          ELSIF v_roll < v_err_bias + 0.14 THEN
            v_golpe := 'SER';
          ELSIF v_roll < v_err_bias + 0.14 + 0.28 THEN
            v_golpe := 'DER';
          ELSIF v_roll < v_err_bias + 0.14 + 0.28 + 0.22 THEN
            v_golpe := 'REV';
          ELSE
            v_golpe := 'BLQ';
          END IF;

          v_roll := random();
          IF v_golpe = 'ERR' THEN
            v_resultado := CASE WHEN random() < 0.7 THEN 'punto_perdido' ELSE 'en_juego' END;
          ELSIF v_roll < v_win_bias THEN
            v_resultado := 'punto_ganado';
          ELSIF v_roll < v_win_bias + 0.28 THEN
            v_resultado := 'punto_perdido';
          ELSE
            v_resultado := 'en_juego';
          END IF;

          v_zona := 1 + floor(random() * 9)::int;
          v_ts := v_ts + 1500 + floor(random() * 5500)::int;

          INSERT INTO tecnico_eventos (
            club_id, sesion_id, jugador_id, timestamp_ms,
            golpe_codigo, zona_mesa, resultado, fase, notas
          ) VALUES (
            v_club, v_sesion_id, r_jugador.id, v_ts,
            v_golpe, v_zona, v_resultado,
            CASE
              WHEN v_golpe = 'SER' THEN 'servicio'
              WHEN v_tipo = 'competencia' THEN 'partido'
              ELSE 'peloteo'
            END,
            'seed-piloto-153'
          );
        END LOOP;

        -- Evaluación publicada (casi todas las sesiones).
        IF random() < 0.9 THEN
          v_resumen := CASE
            WHEN v_progreso < 0.33 THEN
              'Sesión de base. Priorizar regularidad y control de altura.'
            WHEN v_progreso < 0.66 THEN
              'Mejora visible en peloteo. Seguir trabajando colocación de servicio.'
            ELSE
              'Buen nivel de consistencia. Listo para más presión y transición a ataque.'
          END;

          INSERT INTO tecnico_evaluaciones (
            club_id, sesion_id, jugador_id, estado, resumen, publicada_en
          ) VALUES (
            v_club, v_sesion_id, r_jugador.id, 'publicada', v_resumen,
            (v_fecha + time '19:15') AT TIME ZONE 'America/Santiago'
          )
          RETURNING id INTO v_eval_id;

          FOR v_obj_idx IN 1..least(v_n_objs, 4) LOOP
            v_roll := random();
            IF v_progreso < 0.35 THEN
              v_item_estado := CASE
                WHEN v_roll < 0.45 THEN 'en_progreso'
                WHEN v_roll < 0.75 THEN 'no_logrado'
                WHEN v_roll < 0.90 THEN 'pendiente'
                ELSE 'logrado'
              END;
            ELSIF v_progreso < 0.7 THEN
              v_item_estado := CASE
                WHEN v_roll < 0.45 THEN 'en_progreso'
                WHEN v_roll < 0.70 THEN 'logrado'
                WHEN v_roll < 0.85 THEN 'no_logrado'
                ELSE 'pendiente'
              END;
            ELSE
              v_item_estado := CASE
                WHEN v_roll < 0.55 THEN 'logrado'
                WHEN v_roll < 0.85 THEN 'en_progreso'
                WHEN v_roll < 0.95 THEN 'no_logrado'
                ELSE 'pendiente'
              END;
            END IF;

            INSERT INTO tecnico_evaluacion_items (
              evaluacion_id, objetivo_id, codigo, nombre, valor, estado, comentario
            ) VALUES (
              v_eval_id,
              v_obj_ids[v_obj_idx],
              v_obj_codigos[v_obj_idx],
              v_obj_nombres[v_obj_idx],
              round((40 + v_progreso * 45 + random() * 15)::numeric, 1),
              v_item_estado,
              CASE v_item_estado
                WHEN 'logrado' THEN 'Cumple el criterio en la muestra observada.'
                WHEN 'en_progreso' THEN 'Hay avance, falta consistencia.'
                WHEN 'no_logrado' THEN 'Aún no alcanza el criterio acordado.'
                ELSE 'Pendiente de más observaciones.'
              END
            );
          END LOOP;
        END IF;

      END LOOP;
    END LOOP;

    RAISE NOTICE 'Seed % listo', r_jugador.etiqueta;
  END LOOP;

  RAISE NOTICE 'Piloto 153 listo: sesiones/eventos/evaluaciones para Matías y Valentina (% → %)',
    v_inicio, v_hoy;
END $$;

COMMIT;
