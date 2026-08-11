-- Corregir resultado de playoff en torneo oficial (atómico).
-- Requiere: 156 (tablas oficial_*), 160 (tercer_inscrito_id).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('161_corregir_playoff_oficial_seguro');

CREATE OR REPLACE FUNCTION public.corregir_resultado_playoff_oficial_seguro(
  p_partido_id uuid,
  p_nuevo_ganador_id uuid,
  p_sets jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partido public.oficial_partidos%rowtype;
  v_evento public.oficial_eventos%rowtype;
  v_fase_siguiente text;
  v_orden_siguiente integer;
  v_es_slot_a boolean;
  v_siguiente public.oficial_partidos%rowtype;
  v_tercer public.oficial_partidos%rowtype;
  v_perdedor_anterior uuid;
  v_perdedor_nuevo uuid;
BEGIN
  SELECT * INTO v_partido
  FROM public.oficial_partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  SELECT * INTO v_evento
  FROM public.oficial_eventos
  WHERE id = v_partido.evento_id
  FOR UPDATE;

  IF NOT FOUND
     OR auth.uid() IS NULL
     OR public.get_my_rol() IS DISTINCT FROM 'admin'
     OR v_evento.club_id IS NULL
     OR v_evento.club_id IS DISTINCT FROM public.get_my_club_id() THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  IF v_evento.fase = 'finalizado' AND v_partido.fase = 'final' THEN
    RAISE EXCEPTION 'El evento está finalizado';
  END IF;

  IF v_partido.fase IS NULL
     OR v_partido.fase NOT IN ('avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'final', 'tercer_lugar') THEN
    RAISE EXCEPTION 'Fase de playoff inválida';
  END IF;

  IF v_partido.orden IS NULL OR v_partido.orden < 0 THEN
    RAISE EXCEPTION 'Orden de llave inválido';
  END IF;

  IF v_partido.fase IN ('final', 'tercer_lugar') AND v_partido.orden <> 0 THEN
    RAISE EXCEPTION 'Orden inválido para esta fase';
  END IF;

  IF v_partido.ganador_id IS NULL THEN
    RAISE EXCEPTION 'El partido no tiene resultado';
  END IF;

  IF p_nuevo_ganador_id IS DISTINCT FROM v_partido.inscrito_a_id
     AND p_nuevo_ganador_id IS DISTINCT FROM v_partido.inscrito_b_id THEN
    RAISE EXCEPTION 'El ganador debe pertenecer al partido';
  END IF;

  IF p_nuevo_ganador_id = v_partido.ganador_id THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  v_fase_siguiente := CASE v_partido.fase
    WHEN 'avance' THEN '32vos'
    WHEN '32vos' THEN '16vos'
    WHEN '16vos' THEN '8vos'
    WHEN '8vos' THEN 'cuartos'
    WHEN 'cuartos' THEN 'semis'
    WHEN 'semis' THEN 'final'
    ELSE NULL
  END;

  IF v_fase_siguiente IS NOT NULL THEN
    v_orden_siguiente := floor(v_partido.orden / 2.0)::integer;
    v_es_slot_a := mod(v_partido.orden, 2) = 0;

    SELECT * INTO v_siguiente
    FROM public.oficial_partidos
    WHERE evento_id = v_partido.evento_id
      AND fase = v_fase_siguiente
      AND orden = v_orden_siguiente
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe la llave siguiente';
    END IF;

    IF v_siguiente.ganador_id IS NOT NULL THEN
      RAISE EXCEPTION 'Corrige primero la siguiente fase';
    END IF;

    IF (v_es_slot_a AND v_siguiente.inscrito_a_id IS DISTINCT FROM v_partido.ganador_id)
       OR (NOT v_es_slot_a AND v_siguiente.inscrito_b_id IS DISTINCT FROM v_partido.ganador_id) THEN
      RAISE EXCEPTION 'La llave siguiente no contiene al ganador anterior';
    END IF;

    UPDATE public.oficial_partidos
    SET inscrito_a_id = CASE WHEN v_es_slot_a THEN p_nuevo_ganador_id ELSE inscrito_a_id END,
        inscrito_b_id = CASE WHEN NOT v_es_slot_a THEN p_nuevo_ganador_id ELSE inscrito_b_id END,
        actualizado_en = now()
    WHERE id = v_siguiente.id;
  END IF;

  IF v_partido.fase = 'semis' THEN
    SELECT * INTO v_tercer
    FROM public.oficial_partidos
    WHERE evento_id = v_partido.evento_id
      AND fase = 'tercer_lugar'
      AND orden = 0
    FOR UPDATE;

    IF FOUND THEN
      IF v_tercer.ganador_id IS NOT NULL THEN
        RAISE EXCEPTION 'El partido por 3er lugar ya se jugó. Corrige ese resultado primero';
      END IF;

      v_perdedor_anterior := CASE
        WHEN v_partido.ganador_id = v_partido.inscrito_a_id THEN v_partido.inscrito_b_id
        ELSE v_partido.inscrito_a_id
      END;
      v_perdedor_nuevo := CASE
        WHEN p_nuevo_ganador_id = v_partido.inscrito_a_id THEN v_partido.inscrito_b_id
        ELSE v_partido.inscrito_a_id
      END;

      IF v_tercer.inscrito_a_id = v_perdedor_anterior THEN
        UPDATE public.oficial_partidos
        SET inscrito_a_id = v_perdedor_nuevo, actualizado_en = now()
        WHERE id = v_tercer.id;
      ELSIF v_tercer.inscrito_b_id = v_perdedor_anterior THEN
        UPDATE public.oficial_partidos
        SET inscrito_b_id = v_perdedor_nuevo, actualizado_en = now()
        WHERE id = v_tercer.id;
      END IF;
    END IF;
  END IF;

  IF v_partido.fase = 'final' THEN
    UPDATE public.oficial_eventos
    SET campeon_inscrito_id = p_nuevo_ganador_id,
        subcampeon_inscrito_id = CASE
          WHEN p_nuevo_ganador_id = v_partido.inscrito_a_id THEN v_partido.inscrito_b_id
          ELSE v_partido.inscrito_a_id
        END,
        actualizado_en = now()
    WHERE id = v_partido.evento_id;
  END IF;

  IF v_partido.fase = 'tercer_lugar' THEN
    UPDATE public.oficial_eventos
    SET tercer_inscrito_id = p_nuevo_ganador_id,
        actualizado_en = now()
    WHERE id = v_partido.evento_id;
  END IF;

  UPDATE public.oficial_partidos
  SET ganador_id = p_nuevo_ganador_id,
      sets = COALESCE(p_sets, sets),
      es_walkover = false,
      actualizado_en = now()
  WHERE id = p_partido_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_resultado_playoff_oficial_seguro(
  uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_resultado_playoff_oficial_seguro(
  uuid, uuid, jsonb
) TO authenticated;

COMMIT;
