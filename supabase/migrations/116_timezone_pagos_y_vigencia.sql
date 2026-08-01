-- ────────────────────────────────────────────────────────────
-- Auditoría del 31 de julio: el mismo bug de la 115 (dashboard_kpis usando
-- `current_date`, hora del servidor en UTC, en vez de la hora de Chile)
-- aparecía en cinco lugares más, todos vigentes hoy:
--
--   1. registrar_pago_mensualidad_atomico — fecha_pago y movimientos.fecha
--      al marcar una mensualidad como pagada. Un pago hecho de noche podía
--      quedar fechado al mes siguiente y no contar en el mes real.
--   2. registrar_pago_clases_extra_atomico — mismo problema al cobrar
--      clases extraordinarias.
--   3. corregir_mensualidad — mismo problema en dos lugares: el valor por
--      defecto de fecha_pago cuando se corrige sin escribir la fecha a
--      mano, y la fecha del movimiento de "ajuste_mensualidad" que se
--      genera cuando la corrección cambia el monto.
--   4. sincronizar_activo_bloque (trigger) — decide si un bloque sigue
--      "activo" comparando vigente_hasta contra la fecha del servidor.
--   5. El DEFAULT de vigente_desde en bloques_horario, bloque_jugadores y
--      bloque_profesores, para cuando algo se inserta sin pasar la fecha
--      a mano.
--
-- Mismo patrón de arreglo que en toda la migración 032 en adelante:
-- `(now() AT TIME ZONE 'America/Santiago')::date` en vez de `current_date`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

BEGIN;

-- ══ 1. Pago de mensualidad ════════════════════════════════════════════════
-- Mismo cuerpo que la migración 039, cambiando solo current_date → hora Chile
-- en fecha_pago y en el movimiento generado.
CREATE OR REPLACE FUNCTION public.registrar_pago_mensualidad_atomico(
  p_mensualidad_id uuid,
  p_jugador_id uuid,
  p_mes integer,
  p_anio integer,
  p_monto integer,
  p_metodo text,
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
  v_jugador_nombre text; v_mensualidad_id uuid; v_estado text; v_movimiento_id uuid;
  v_meses text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Mes o año inválido'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo', 'transferencia') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'pago_mensualidad');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT nombre INTO v_jugador_nombre FROM public.jugadores
  WHERE id = p_jugador_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mensualidad:' || v_club_id::text || ':' || p_jugador_id::text || ':' || p_anio::text || ':' || p_mes::text, 0));

  IF p_mensualidad_id IS NOT NULL THEN
    SELECT id, estado INTO v_mensualidad_id, v_estado
    FROM public.mensualidades
    WHERE id = p_mensualidad_id AND club_id = v_club_id AND jugador_id = p_jugador_id AND mes = p_mes AND anio = p_anio
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no coincide con el jugador o período'; END IF;
  ELSE
    SELECT id, estado INTO v_mensualidad_id, v_estado
    FROM public.mensualidades
    WHERE club_id = v_club_id AND jugador_id = p_jugador_id AND mes = p_mes AND anio = p_anio
    FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado)
      VALUES (v_club_id, p_jugador_id, p_mes, p_anio, 'pendiente')
      RETURNING id, estado INTO v_mensualidad_id, v_estado;
    END IF;
  END IF;
  IF v_estado = 'pagado' THEN RAISE EXCEPTION 'La mensualidad ya está pagada'; END IF;
  IF v_estado IS NULL OR v_estado NOT IN ('pendiente', 'atrasado') THEN RAISE EXCEPTION 'Estado de mensualidad inválido'; END IF;

  UPDATE public.mensualidades
  SET estado = 'pagado', fecha_pago = v_hoy, monto = p_monto, metodo = p_metodo
  WHERE id = v_mensualidad_id;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
    mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id
  ) VALUES (
    v_club_id, 'ingreso', 'mensualidad',
    'Mensualidad ' || v_jugador_nombre || ' — ' || v_meses[p_mes] || ' ' || p_anio,
    p_monto, v_hoy, p_jugador_id, p_mes, p_anio, v_admin_nombre, v_mensualidad_id
  ) RETURNING id INTO v_movimiento_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'mensualidades', v_mensualidad_id, 'pagar',
    jsonb_build_object('monto', p_monto, 'metodo', p_metodo, 'movimiento_id', v_movimiento_id), v_user_id);

  v_resultado := jsonb_build_object('mensualidad_id', v_mensualidad_id, 'movimiento_id', v_movimiento_id, 'estado', 'pagado');
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;


-- ══ 2. Cobro de clases extraordinarias ════════════════════════════════════
-- Mismo cuerpo que la migración 099, cambiando solo current_date → hora Chile
-- en el movimiento generado.
CREATE OR REPLACE FUNCTION public.registrar_pago_clases_extra_atomico(
  p_ids             uuid[],
  p_metodo          text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb;
  v_jugador_id uuid; v_jugadores integer; v_encontradas integer;
  v_total integer; v_nombre text; v_movimiento_id uuid; v_afectadas integer;
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 200 THEN
    RAISE EXCEPTION 'Lista de clases inválida';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'pago_clases_extra');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  -- Se bloquean antes de mirarlas: dos pantallas cobrando lo mismo a la vez
  -- generarían dos movimientos por una sola clase.
  PERFORM 1 FROM clases_extraordinarias
  WHERE id = ANY(p_ids) AND club_id = v_club_id FOR UPDATE;

  SELECT count(*), count(DISTINCT jugador_id), coalesce(sum(monto), 0)::integer,
         (array_agg(jugador_id))[1]
    INTO v_encontradas, v_jugadores, v_total, v_jugador_id
  FROM clases_extraordinarias
  WHERE id = ANY(p_ids) AND club_id = v_club_id;

  IF v_encontradas <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Alguna de esas clases no es de este club';
  END IF;
  IF v_jugadores <> 1 THEN
    RAISE EXCEPTION 'Todas las clases del mismo cobro tienen que ser del mismo jugador';
  END IF;
  IF EXISTS (SELECT 1 FROM clases_extraordinarias WHERE id = ANY(p_ids) AND pagada_en IS NOT NULL) THEN
    RAISE EXCEPTION 'Alguna de esas clases ya está pagada';
  END IF;
  IF EXISTS (SELECT 1 FROM clases_extraordinarias WHERE id = ANY(p_ids) AND monto IS NULL) THEN
    RAISE EXCEPTION 'Hay clases sin monto asignado: no se puede cobrar lo que no tiene precio';
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El total debe ser mayor a cero'; END IF;

  SELECT nombre INTO v_nombre FROM jugadores WHERE id = v_jugador_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, jugador_id, registrado_por_nombre
  ) VALUES (
    v_club_id, 'ingreso', 'clase_extraordinaria',
    'Clase extra — ' || v_nombre || ' (' || v_encontradas || ')',
    v_total, v_hoy, v_jugador_id, v_admin_nombre
  ) RETURNING id INTO v_movimiento_id;

  UPDATE clases_extraordinarias
  SET pagada_en = now(),
      -- Si nunca se mandó a cobro, cobrarla la manda: no tiene sentido dejarla
      -- pagada y "sin enviar".
      cobrada_en = coalesce(cobrada_en, now()),
      movimiento_id = v_movimiento_id
  WHERE id = ANY(p_ids) AND club_id = v_club_id;
  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'No se pudieron marcar todas las clases como pagadas';
  END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'clases_extraordinarias', v_movimiento_id, 'pagar',
    jsonb_build_object('clases', p_ids, 'monto', v_total, 'metodo', p_metodo,
                       'jugador_id', v_jugador_id), v_user_id);

  v_resultado := jsonb_build_object(
    'movimiento_id', v_movimiento_id, 'monto', v_total, 'clases', v_encontradas);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;


-- ══ 3. Corregir mensualidad desde Históricas ══════════════════════════════
-- Mismo cuerpo que la migración 093, cambiando solo el fallback de
-- fecha_pago cuando el admin no la escribe a mano.
CREATE OR REPLACE FUNCTION public.corregir_mensualidad(
  p_jugador_id uuid,
  p_mes        integer,
  p_anio       integer,
  p_estado     text,
  p_monto      numeric DEFAULT NULL,
  p_fecha_pago date    DEFAULT NULL,
  p_metodo     text    DEFAULT NULL,
  p_motivo     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club      uuid;
  v_rol       text;
  v_nombre    text;
  v_jugador   text;
  v_id        uuid;
  v_estado_a  text;
  v_monto_a   numeric;
  v_fecha_a   date;
  v_aporte_a  numeric;
  v_aporte_n  numeric;
  v_ajuste    numeric;
  v_hoy       date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT p.club_id, p.rol, p.nombre INTO v_club, v_rol, v_nombre
  FROM perfiles p WHERE p.id = auth.uid();

  -- El IS NULL va aparte: sin él, un perfil sin rol se salta el guardia.
  IF v_club IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el administrador puede corregir mensualidades';
  END IF;

  SELECT j.nombre INTO v_jugador FROM jugadores j
  WHERE j.id = p_jugador_id AND j.club_id = v_club;
  IF v_jugador IS NULL THEN RAISE EXCEPTION 'El jugador no es de este club'; END IF;

  IF p_mes NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes inválido: %', p_mes; END IF;
  IF p_estado NOT IN ('pagado', 'pendiente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT m.id, m.estado, m.monto, m.fecha_pago
    INTO v_id, v_estado_a, v_monto_a, v_fecha_a
  FROM mensualidades m
  WHERE m.jugador_id = p_jugador_id AND m.mes = p_mes AND m.anio = p_anio;

  v_aporte_a := CASE WHEN v_estado_a = 'pagado' THEN COALESCE(v_monto_a, 0) ELSE 0 END;
  v_aporte_n := CASE WHEN p_estado  = 'pagado' THEN COALESCE(p_monto, v_monto_a, 0) ELSE 0 END;
  v_ajuste   := v_aporte_n - v_aporte_a;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM mensualidades WHERE id = v_id;
  ELSIF v_id IS NULL THEN
    INSERT INTO mensualidades (club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo)
    VALUES (v_club, p_jugador_id, p_mes, p_anio, p_monto, p_estado,
            CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, v_hoy) END, p_metodo)
    RETURNING id INTO v_id;
  ELSE
    UPDATE mensualidades SET
      estado     = p_estado,
      monto      = COALESCE(p_monto, monto),
      fecha_pago = CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, fecha_pago, v_hoy) ELSE NULL END,
      metodo     = COALESCE(p_metodo, metodo)
    WHERE id = v_id;
  END IF;

  IF v_estado_a IS DISTINCT FROM NULLIF(p_estado, 'sin_registro')
     OR COALESCE(p_monto, v_monto_a) IS DISTINCT FROM v_monto_a
     OR (p_fecha_pago IS NOT NULL AND p_fecha_pago IS DISTINCT FROM v_fecha_a) THEN

    INSERT INTO auditoria_mensualidades
      (club_id, jugador_id, mes, anio, estado_anterior, estado_nuevo,
       monto_anterior, monto_nuevo, fecha_anterior, fecha_nueva, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_mes, p_anio, v_estado_a, NULLIF(p_estado, 'sin_registro'),
       v_monto_a, CASE WHEN p_estado = 'sin_registro' THEN NULL ELSE COALESCE(p_monto, v_monto_a) END,
       v_fecha_a, p_fecha_pago, p_motivo, auth.uid());
  END IF;

  IF v_ajuste <> 0 THEN
    INSERT INTO movimientos
      (club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
       mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id)
    VALUES
      (v_club,
       CASE WHEN v_ajuste > 0 THEN 'ingreso' ELSE 'egreso' END,
       'ajuste_mensualidad',
       'Ajuste de mensualidad · ' || v_jugador || ' · ' ||
         to_char(make_date(p_anio, p_mes, 1), 'TMMonth YYYY') ||
         COALESCE(' · ' || p_motivo, ''),
       abs(v_ajuste),
       v_hoy, p_jugador_id, p_mes, p_anio, v_nombre, v_id);
  END IF;
END;
$$;


-- ══ 4. El trigger que marca un bloque activo/inactivo ═════════════════════
-- Mismo cuerpo que la migración 086, cambiando solo current_date → hora Chile.
CREATE OR REPLACE FUNCTION public.sincronizar_activo_bloque()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.activo := (NEW.vigente_hasta IS NULL OR NEW.vigente_hasta >= (now() AT TIME ZONE 'America/Santiago')::date);
  RETURN NEW;
END;
$$;


-- ══ 5. El DEFAULT de vigente_desde en las tres tablas de vigencia ═════════
-- La app ya pasa la fecha a mano en casi todos los caminos (ver
-- src/app/actions/horario.ts), pero crear un bloque nuevo no lo hacía y
-- quedaba a merced de este default.
ALTER TABLE bloques_horario    ALTER COLUMN vigente_desde SET DEFAULT (now() AT TIME ZONE 'America/Santiago')::date;
ALTER TABLE bloque_jugadores   ALTER COLUMN vigente_desde SET DEFAULT (now() AT TIME ZONE 'America/Santiago')::date;
ALTER TABLE bloque_profesores  ALTER COLUMN vigente_desde SET DEFAULT (now() AT TIME ZONE 'America/Santiago')::date;

COMMIT;
