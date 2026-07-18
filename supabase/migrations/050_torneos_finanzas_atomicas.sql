-- CmSports — lleva pagos y premios de torneo al mismo patrón atómico que
-- mensualidades/liga (039_finanzas_atomicas.sql): RPC con transacción única
-- e idempotencia vía finanzas_operaciones, en vez de insert+update sueltos
-- desde la Server Action (que podían quedar a medio camino si el segundo
-- paso fallaba, o duplicar movimientos en un reintento).
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.subir_pagos_torneo_a_finanzas_atomico(
  p_torneo_id uuid,
  p_jugador_ids uuid[],
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb;
  v_torneo_nombre text; v_cuota integer;
  v_cant_efectivo integer; v_cant_transferencia integer; v_cantidad integer; v_monto integer;
  v_fecha date := current_date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'subir_pagos_torneo');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT nombre, cuota_inscripcion INTO v_torneo_nombre, v_cuota
  FROM public.torneos WHERE id = p_torneo_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Torneo no encontrado en el club'; END IF;
  IF v_cuota IS NULL OR v_cuota <= 0 THEN RAISE EXCEPTION 'El torneo no tiene cuota de inscripción'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('torneo_pagos_finanzas:' || p_torneo_id::text, 0));

  SELECT
    count(*) FILTER (WHERE metodo_pago = 'transferencia'),
    count(*) FILTER (WHERE metodo_pago IS DISTINCT FROM 'transferencia')
  INTO v_cant_transferencia, v_cant_efectivo
  FROM public.torneo_pagos
  WHERE torneo_id = p_torneo_id AND estado = 'pagado' AND subido_a_finanzas = false
    AND (p_jugador_ids IS NULL OR jugador_id = ANY(p_jugador_ids));

  v_cantidad := coalesce(v_cant_efectivo, 0) + coalesce(v_cant_transferencia, 0);
  IF v_cantidad = 0 THEN RAISE EXCEPTION 'No hay pagos pendientes de subir a Finanzas'; END IF;
  v_monto := v_cantidad * v_cuota;

  IF v_cant_efectivo > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'ingreso', 'inscripcion_torneo',
      'Inscripción Torneo (efectivo) — ' || v_torneo_nombre || ' (' || v_cant_efectivo || ')',
      v_cant_efectivo * v_cuota, v_fecha, v_admin_nombre);
  END IF;
  IF v_cant_transferencia > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'ingreso', 'inscripcion_torneo',
      'Inscripción Torneo (transferencia) — ' || v_torneo_nombre || ' (' || v_cant_transferencia || ')',
      v_cant_transferencia * v_cuota, v_fecha, v_admin_nombre);
  END IF;

  UPDATE public.torneo_pagos
  SET subido_a_finanzas = true
  WHERE torneo_id = p_torneo_id AND estado = 'pagado' AND subido_a_finanzas = false
    AND (p_jugador_ids IS NULL OR jugador_id = ANY(p_jugador_ids));

  UPDATE public.torneos SET contabilidad_enviada = true WHERE id = p_torneo_id;

  v_resultado := jsonb_build_object('cantidad', v_cantidad, 'monto', v_monto);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_premios_torneo_atomico(
  p_torneo_id uuid,
  p_torneo_nombre text,
  p_primero integer,
  p_segundo integer,
  p_tercero integer,
  p_metodo text,
  p_gastos jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb;
  v_via text;
  v_fecha date := current_date;
  v_gasto jsonb;
  v_tipo text; v_monto integer;
  v_movimientos_creados integer := 0;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.torneos WHERE id = p_torneo_id AND club_id = v_club_id) THEN
    RAISE EXCEPTION 'Torneo no encontrado en el club';
  END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'guardar_premios_torneo');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  v_via := CASE WHEN p_metodo = 'transferencia' THEN ' (transferencia)' ELSE ' (efectivo)' END;

  UPDATE public.torneos
  SET premio_primero = p_primero, premio_segundo = p_segundo, premio_tercero = p_tercero
  WHERE id = p_torneo_id;

  IF p_primero IS NOT NULL AND p_primero > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 1°' || v_via || ' — ' || p_torneo_nombre, p_primero, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;
  IF p_segundo IS NOT NULL AND p_segundo > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 2°' || v_via || ' — ' || p_torneo_nombre, p_segundo, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;
  IF p_tercero IS NOT NULL AND p_tercero > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 3°' || v_via || ' — ' || p_torneo_nombre, p_tercero, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;

  FOR v_gasto IN SELECT * FROM jsonb_array_elements(coalesce(p_gastos, '[]'::jsonb))
  LOOP
    v_tipo := btrim(v_gasto->>'tipo');
    v_monto := nullif(v_gasto->>'monto', '')::integer;
    IF v_tipo IS NOT NULL AND v_tipo <> '' AND v_monto IS NOT NULL AND v_monto > 0 THEN
      INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
      VALUES (v_club_id, p_torneo_id, 'gasto', 'otro_gasto', v_tipo || ' — ' || p_torneo_nombre, v_monto, v_fecha, v_admin_nombre);
      v_movimientos_creados := v_movimientos_creados + 1;
    END IF;
  END LOOP;

  IF v_movimientos_creados > 0 THEN
    UPDATE public.torneos SET contabilidad_enviada = true WHERE id = p_torneo_id;
  END IF;

  v_resultado := jsonb_build_object('movimientos_creados', v_movimientos_creados);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.subir_pagos_torneo_a_finanzas_atomico(uuid, uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guardar_premios_torneo_atomico(uuid, text, integer, integer, integer, text, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.subir_pagos_torneo_a_finanzas_atomico(uuid, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_premios_torneo_atomico(uuid, text, integer, integer, integer, text, jsonb, uuid) TO authenticated;

COMMIT;
