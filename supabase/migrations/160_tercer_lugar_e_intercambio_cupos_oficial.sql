-- Torneo oficial: tercer lugar + intercambio de cupos en ronda inicial.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('160_tercer_lugar_e_intercambio_cupos_oficial');

ALTER TABLE oficial_eventos
  ADD COLUMN IF NOT EXISTS tercer_inscrito_id uuid;

ALTER TABLE oficial_eventos
  DROP CONSTRAINT IF EXISTS oficial_eventos_tercer_fkey;

ALTER TABLE oficial_eventos
  ADD CONSTRAINT oficial_eventos_tercer_fkey
  FOREIGN KEY (tercer_inscrito_id) REFERENCES oficial_inscritos(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.intercambiar_cupos_oficial_seguro(
  p_evento_id uuid,
  p_partido_a_id uuid,
  p_posicion_a text,
  p_partido_b_id uuid,
  p_posicion_b text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a public.oficial_partidos%rowtype;
  v_b public.oficial_partidos%rowtype;
  v_evento public.oficial_eventos%rowtype;
  v_inscrito_a uuid;
  v_inscrito_b uuid;
  v_grupo_a uuid;
  v_grupo_b uuid;
  v_pos_a smallint;
  v_pos_b smallint;
  v_otro_grupo_a uuid;
  v_otro_grupo_b uuid;
  v_fase_inicial text;
  v_total_llaves integer;
  v_llaves_con_orden integer;
  v_orden_minimo integer;
  v_orden_maximo integer;
BEGIN
  IF p_partido_a_id = p_partido_b_id AND p_posicion_a = p_posicion_b THEN
    RETURN jsonb_build_object('success', true);
  END IF;
  IF p_posicion_a IS NULL OR p_posicion_b IS NULL
     OR p_posicion_a NOT IN ('inscrito_a', 'inscrito_b')
     OR p_posicion_b NOT IN ('inscrito_a', 'inscrito_b') THEN
    RAISE EXCEPTION 'Cupo inválido';
  END IF;

  PERFORM 1
  FROM public.oficial_partidos
  WHERE id IN (p_partido_a_id, p_partido_b_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_a
  FROM public.oficial_partidos
  WHERE id = p_partido_a_id;

  SELECT * INTO v_b
  FROM public.oficial_partidos
  WHERE id = p_partido_b_id;

  IF v_a.id IS NULL OR v_b.id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron ambos cupos';
  END IF;

  SELECT * INTO v_evento
  FROM public.oficial_eventos
  WHERE id = p_evento_id
  FOR UPDATE;

  IF NOT FOUND
     OR auth.uid() IS NULL
     OR public.get_my_rol() IS DISTINCT FROM 'admin'
     OR v_evento.club_id IS NULL
     OR v_evento.club_id IS DISTINCT FROM public.get_my_club_id() THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  IF v_a.evento_id IS DISTINCT FROM p_evento_id
     OR v_b.evento_id IS DISTINCT FROM p_evento_id
     OR v_a.fase IS DISTINCT FROM v_b.fase
     OR v_a.fase = 'grupos' THEN
    RAISE EXCEPTION 'Los cupos no pertenecen a la misma ronda';
  END IF;
  IF (v_a.inscrito_b_id IS NOT NULL AND v_a.ganador_id IS NOT NULL)
     OR (v_b.inscrito_b_id IS NOT NULL AND v_b.ganador_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La llave ya fue jugada';
  END IF;

  SELECT p.fase INTO v_fase_inicial
  FROM public.oficial_partidos p
  WHERE p.evento_id = p_evento_id
    AND p.fase NOT IN ('grupos', 'tercer_lugar')
  ORDER BY CASE p.fase
    WHEN 'avance' THEN 0
    WHEN '32vos' THEN 1
    WHEN '16vos' THEN 2
    WHEN '8vos' THEN 3
    WHEN 'cuartos' THEN 4
    WHEN 'semis' THEN 5
    WHEN 'final' THEN 6
    ELSE 99
  END
  LIMIT 1;

  IF v_a.fase IS DISTINCT FROM v_fase_inicial THEN
    RAISE EXCEPTION 'Solo se edita la ronda inicial';
  END IF;

  SELECT
    count(*)::integer,
    count(p.orden)::integer,
    min(p.orden),
    max(p.orden)
  INTO v_total_llaves, v_llaves_con_orden, v_orden_minimo, v_orden_maximo
  FROM public.oficial_partidos p
  WHERE p.evento_id = p_evento_id
    AND p.fase = v_fase_inicial;

  IF v_total_llaves < 1
     OR v_llaves_con_orden <> v_total_llaves
     OR v_orden_minimo <> 0
     OR v_orden_maximo <> v_total_llaves - 1
     OR (v_total_llaves > 1 AND mod(v_total_llaves, 2) <> 0) THEN
    RAISE EXCEPTION 'La ronda inicial tiene un orden inválido';
  END IF;

  v_inscrito_a := CASE
    WHEN p_posicion_a = 'inscrito_a' THEN v_a.inscrito_a_id
    ELSE v_a.inscrito_b_id
  END;
  v_inscrito_b := CASE
    WHEN p_posicion_b = 'inscrito_a' THEN v_b.inscrito_a_id
    ELSE v_b.inscrito_b_id
  END;
  v_grupo_a := CASE
    WHEN p_posicion_a = 'inscrito_a' THEN v_a.slot_a_grupo_id
    ELSE v_a.slot_b_grupo_id
  END;
  v_grupo_b := CASE
    WHEN p_posicion_b = 'inscrito_a' THEN v_b.slot_a_grupo_id
    ELSE v_b.slot_b_grupo_id
  END;
  v_pos_a := CASE
    WHEN p_posicion_a = 'inscrito_a' THEN v_a.slot_a_posicion
    ELSE v_a.slot_b_posicion
  END;
  v_pos_b := CASE
    WHEN p_posicion_b = 'inscrito_a' THEN v_b.slot_a_posicion
    ELSE v_b.slot_b_posicion
  END;
  v_otro_grupo_a := CASE
    WHEN p_posicion_a = 'inscrito_a' THEN v_a.slot_b_grupo_id
    ELSE v_a.slot_a_grupo_id
  END;
  v_otro_grupo_b := CASE
    WHEN p_posicion_b = 'inscrito_a' THEN v_b.slot_b_grupo_id
    ELSE v_b.slot_a_grupo_id
  END;

  IF v_inscrito_a IS NULL AND v_inscrito_b IS NULL THEN
    RAISE EXCEPTION 'No hay nada que mover entre esos dos cupos';
  END IF;
  IF v_inscrito_b IS NULL AND v_otro_grupo_a IS NULL THEN
    RAISE EXCEPTION 'Esa llave se quedaría sin ningún jugador';
  END IF;
  IF v_inscrito_a IS NULL AND v_otro_grupo_b IS NULL THEN
    RAISE EXCEPTION 'Esa llave se quedaría sin ningún jugador';
  END IF;
  IF v_grupo_b = v_otro_grupo_a OR v_grupo_a = v_otro_grupo_b THEN
    RAISE EXCEPTION 'Un grupo no puede enfrentarse a sí mismo en la misma llave';
  END IF;

  UPDATE public.oficial_partidos
  SET ganador_id = NULL
  WHERE id IN (v_a.id, v_b.id) AND ganador_id IS NOT NULL;

  UPDATE public.oficial_partidos SET
    inscrito_a_id = CASE WHEN p_posicion_a = 'inscrito_a' THEN v_inscrito_b ELSE inscrito_a_id END,
    inscrito_b_id = CASE WHEN p_posicion_a = 'inscrito_b' THEN v_inscrito_b ELSE inscrito_b_id END,
    slot_a_grupo_id = CASE WHEN p_posicion_a = 'inscrito_a' THEN v_grupo_b ELSE slot_a_grupo_id END,
    slot_b_grupo_id = CASE WHEN p_posicion_a = 'inscrito_b' THEN v_grupo_b ELSE slot_b_grupo_id END,
    slot_a_posicion = CASE WHEN p_posicion_a = 'inscrito_a' THEN v_pos_b ELSE slot_a_posicion END,
    slot_b_posicion = CASE WHEN p_posicion_a = 'inscrito_b' THEN v_pos_b ELSE slot_b_posicion END
  WHERE id = v_a.id;

  UPDATE public.oficial_partidos SET
    inscrito_a_id = CASE WHEN p_posicion_b = 'inscrito_a' THEN v_inscrito_a ELSE inscrito_a_id END,
    inscrito_b_id = CASE WHEN p_posicion_b = 'inscrito_b' THEN v_inscrito_a ELSE inscrito_b_id END,
    slot_a_grupo_id = CASE WHEN p_posicion_b = 'inscrito_a' THEN v_grupo_a ELSE slot_a_grupo_id END,
    slot_b_grupo_id = CASE WHEN p_posicion_b = 'inscrito_b' THEN v_grupo_a ELSE slot_b_grupo_id END,
    slot_a_posicion = CASE WHEN p_posicion_b = 'inscrito_a' THEN v_pos_a ELSE slot_a_posicion END,
    slot_b_posicion = CASE WHEN p_posicion_b = 'inscrito_b' THEN v_pos_a ELSE slot_b_posicion END
  WHERE id = v_b.id;

  UPDATE public.oficial_partidos
  SET ganador_id = CASE WHEN inscrito_b_id IS NULL THEN inscrito_a_id ELSE NULL END
  WHERE id IN (v_a.id, v_b.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.intercambiar_cupos_oficial_seguro(
  uuid, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intercambiar_cupos_oficial_seguro(
  uuid, uuid, text, uuid, text
) TO authenticated;

COMMIT;
