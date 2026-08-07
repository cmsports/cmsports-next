-- Tres hallazgos de la auditoría del 2026-08-07, todos vigentes hoy.
--
-- ── 1. Los dos RPC de plata de torneos fechaban en UTC ────────────────────
-- La migración 116 (auditoría del 31 de julio) corrigió `current_date` por la
-- hora de Chile en cinco lugares, pero se saltó los dos de la migración 050:
-- `subir_pagos_torneo_a_finanzas_atomico` y `guardar_premios_torneo_atomico`.
-- Los dos siguen declarando `v_fecha date := current_date`, que es la fecha
-- del servidor en UTC. Una inscripción cobrada o un premio pagado después de
-- las 20:00 en Chile queda fechado al día siguiente, y si cae en fin de mes,
-- entra en el mes equivocado y descuadra el cierre.
--
-- ── 2. Los gastos de gestión no dejaban rastro ────────────────────────────
-- `guardarGastosGestion` (src/app/actions/torneos.ts) insertaba directo en
-- `movimientos` desde la Server Action, salteándose el patrón atómico. Sin
-- idempotencia (un doble clic duplicaba el gasto) y sin pasar por
-- `finanzas_operaciones`. Se agrega su RPC, igual que el resto de las
-- operaciones financieras.
--
-- No se pudo reutilizar `guardar_premios_torneo_atomico` para esto: esa
-- función hace `UPDATE torneos SET premio_primero = p_primero, ...` sin
-- condición, así que llamarla solo para gastos —con los premios en NULL—
-- borraría los premios ya guardados del torneo.
--
-- ── 3. `division_ranking` entregaba datos a cualquiera ────────────────────
-- Es la única vista del proyecto, y en Postgres una vista corre con los
-- permisos de su dueño y NO aplica el RLS de las tablas que consulta, salvo
-- que se le pida. Sin sesión y con la llave pública —que va en el bundle del
-- navegador— se leían nombre y estadísticas de los jugadores de liga de todos
-- los clubes. Se comprobó: 24 jugadores de 3 divisiones, sin autenticar.
-- `security_invoker` hace que la vista aplique el RLS de quien la consulta,
-- que es lo que ya protege a `liga_division_jugadores` y `jugadores`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('137_auditoria_torneos_fecha_gastos_y_vista');


-- ══ 1a. Inscripciones de torneo con fecha de Chile ════════════════════════
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
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
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


-- ══ 1b. Premios de torneo con fecha de Chile ══════════════════════════════
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
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
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


-- ══ 2. Gastos de gestión, atómicos y sin pisar los premios ════════════════
CREATE OR REPLACE FUNCTION public.registrar_gastos_gestion_torneo_atomico(
  p_torneo_id uuid,
  p_torneo_nombre text,
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
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_gasto jsonb;
  v_tipo text; v_monto integer;
  v_creados integer := 0;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  -- El torneo tiene que ser del club de quien llama: sin esto, un admin podría
  -- cargarle gastos al torneo de otro club pasando su id.
  IF NOT EXISTS (SELECT 1 FROM public.torneos WHERE id = p_torneo_id AND club_id = v_club_id) THEN
    RAISE EXCEPTION 'Torneo no encontrado en el club';
  END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'gastos_gestion_torneo');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  FOR v_gasto IN SELECT * FROM jsonb_array_elements(coalesce(p_gastos, '[]'::jsonb))
  LOOP
    v_tipo := btrim(v_gasto->>'tipo');
    v_monto := nullif(v_gasto->>'monto', '')::integer;
    IF v_tipo IS NOT NULL AND v_tipo <> '' AND v_monto IS NOT NULL AND v_monto > 0 THEN
      INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
      VALUES (v_club_id, p_torneo_id, 'gasto', 'otro_gasto', v_tipo || ' — ' || p_torneo_nombre, v_monto, v_fecha, v_admin_nombre);
      v_creados := v_creados + 1;
    END IF;
  END LOOP;

  IF v_creados = 0 THEN RAISE EXCEPTION 'No hay gastos válidos'; END IF;

  UPDATE public.torneos SET contabilidad_enviada = true WHERE id = p_torneo_id;

  v_resultado := jsonb_build_object('cantidad', v_creados);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_gastos_gestion_torneo_atomico(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_gastos_gestion_torneo_atomico(uuid, text, jsonb, uuid) TO authenticated;


-- ══ 3. La vista de ranking deja de saltarse el RLS ════════════════════════
ALTER VIEW public.division_ranking SET (security_invoker = on);

COMMENT ON VIEW public.division_ranking IS
  'security_invoker=on desde la migración 137: sin eso la vista corría con los permisos de su dueño y entregaba nombres y estadísticas de todos los clubes a cualquiera con la llave pública, sin sesión.';

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) Ninguno de los tres RPC debe seguir usando current_date:
SELECT proname,
       prosrc ILIKE '%America/Santiago%' AS usa_hora_chile,
       prosrc ILIKE '%current_date%'     AS deberia_ser_false
FROM pg_proc
WHERE proname IN ('subir_pagos_torneo_a_finanzas_atomico',
                  'guardar_premios_torneo_atomico',
                  'registrar_gastos_gestion_torneo_atomico');

-- 2) La vista debe quedar con security_invoker:
SELECT relname, reloptions
FROM pg_class WHERE relname = 'division_ranking';
