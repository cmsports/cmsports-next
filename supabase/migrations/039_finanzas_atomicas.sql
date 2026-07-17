-- CmSports — operaciones financieras atómicas
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- No elimina ni corrige automáticamente datos financieros históricos.

BEGIN;

-- La unicidad es necesaria para serializar pagos mensuales concurrentes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mensualidades
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
    GROUP BY club_id, jugador_id, mes, anio
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'FIN-039: existen mensualidades duplicadas por club/jugador/mes/año; deben conciliarse manualmente antes de ejecutar esta migración';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS mensualidades_club_jugador_periodo_uidx
  ON public.mensualidades (club_id, jugador_id, mes, anio)
  WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL;

ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS mensualidad_id uuid;

-- 041 endurece esta columna con constraint/políticas. Se crea aquí para que
-- las RPC de mensualidades y movimientos ya escriban auditoría tenant-aware.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS club_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos'::regclass
      AND conname = 'movimientos_mensualidad_id_fkey'
  ) THEN
    ALTER TABLE public.movimientos
      ADD CONSTRAINT movimientos_mensualidad_id_fkey
      FOREIGN KEY (mensualidad_id) REFERENCES public.mensualidades(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_pago_mensualidad_uidx
  ON public.movimientos (mensualidad_id)
  WHERE mensualidad_id IS NOT NULL AND categoria = 'mensualidad';

CREATE INDEX IF NOT EXISTS movimientos_mensualidad_legacy_idx
  ON public.movimientos (club_id, jugador_id, mes_correspondiente, anio_correspondiente)
  WHERE categoria = 'mensualidad';

CREATE TABLE IF NOT EXISTS public.finanzas_operaciones (
  club_id uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  clave uuid NOT NULL,
  operacion text NOT NULL,
  resultado jsonb,
  usuario_id uuid NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, clave)
);

ALTER TABLE public.finanzas_operaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finanzas_operaciones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._finanzas_admin_contexto(
  OUT club_id uuid,
  OUT user_id uuid,
  OUT nombre text
)
RETURNS record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT p.club_id, p.id, coalesce(nullif(btrim(p.nombre), ''), 'Admin')
    INTO club_id, user_id, nombre
  FROM public.perfiles p
  WHERE p.id = auth.uid()
    AND p.rol = 'admin'
    AND p.club_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._finanzas_reclamar_operacion(
  p_club_id uuid,
  p_user_id uuid,
  p_clave uuid,
  p_operacion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_insertados integer;
  v_operacion text;
  v_resultado jsonb;
BEGIN
  IF p_clave IS NULL THEN
    RAISE EXCEPTION 'Clave de idempotencia inválida';
  END IF;

  INSERT INTO public.finanzas_operaciones (club_id, clave, operacion, usuario_id)
  VALUES (p_club_id, p_clave, p_operacion, p_user_id)
  ON CONFLICT (club_id, clave) DO NOTHING;
  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  IF v_insertados = 1 THEN
    RETURN NULL;
  END IF;

  SELECT operacion, resultado INTO v_operacion, v_resultado
  FROM public.finanzas_operaciones
  WHERE club_id = p_club_id AND clave = p_clave;

  IF v_operacion IS DISTINCT FROM p_operacion THEN
    RAISE EXCEPTION 'La clave de idempotencia ya fue usada para otra operación';
  END IF;
  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'La operación idempotente no tiene un resultado confirmado';
  END IF;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._finanzas_admin_contexto() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._finanzas_reclamar_operacion(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pago_liga_atomico(
  p_division_id uuid,
  p_jugador_id uuid,
  p_monto_total integer,
  p_monto_abono integer,
  p_fecha date,
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
  v_pago_id uuid; v_abono_id uuid; v_movimiento_id uuid;
  v_monto_total integer; v_monto_pagado integer; v_nuevo_monto integer;
  v_estado text; v_jugador_nombre text; v_liga_nombre text;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_monto_total IS NULL OR p_monto_total <= 0 OR p_monto_abono IS NULL OR p_monto_abono <= 0 THEN
    RAISE EXCEPTION 'Los montos deben ser mayores a cero';
  END IF;
  IF p_monto_abono > p_monto_total THEN
    RAISE EXCEPTION 'El abono no puede superar el monto total';
  END IF;
  IF p_fecha IS NULL OR p_fecha < DATE '2000-01-01' OR p_fecha > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Fecha inválida';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'pago_liga');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT j.nombre, l.nombre INTO v_jugador_nombre, v_liga_nombre
  FROM public.liga_divisiones d
  JOIN public.ligas l ON l.id = d.liga_id
  JOIN public.jugadores j ON j.id = p_jugador_id
  WHERE d.id = p_division_id
    AND l.club_id = v_club_id
    AND j.club_id = v_club_id
    AND d.deleted_at IS NULL
    AND l.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'División o jugador no pertenece al club'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pago_liga:' || p_division_id::text || ':' || p_jugador_id::text, 0));

  SELECT id, monto_total, monto_pagado INTO v_pago_id, v_monto_total, v_monto_pagado
  FROM public.liga_jugador_pagos
  WHERE division_id = p_division_id AND jugador_id = p_jugador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.liga_jugador_pagos (division_id, jugador_id, monto_total, monto_pagado, estado)
    VALUES (p_division_id, p_jugador_id, p_monto_total, 0, 'pendiente')
    RETURNING id, monto_total, monto_pagado INTO v_pago_id, v_monto_total, v_monto_pagado;
  ELSIF v_monto_total <> p_monto_total THEN
    RAISE EXCEPTION 'El monto total no coincide con el pago ya inicializado';
  END IF;

  v_nuevo_monto := v_monto_pagado + p_monto_abono;
  IF v_nuevo_monto > v_monto_total THEN RAISE EXCEPTION 'El abono excede el saldo pendiente'; END IF;
  v_estado := CASE WHEN v_nuevo_monto = v_monto_total THEN 'pagado' ELSE 'parcial' END;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre
  ) VALUES (
    v_club_id, 'ingreso', 'inscripcion_liga',
    'Inscripción liga — ' || v_jugador_nombre || ' · ' || v_liga_nombre,
    p_monto_abono, p_fecha, v_admin_nombre
  ) RETURNING id INTO v_movimiento_id;

  INSERT INTO public.liga_abonos (pago_id, monto, fecha, metodo, movimiento_id)
  VALUES (v_pago_id, p_monto_abono, p_fecha, p_metodo, v_movimiento_id)
  RETURNING id INTO v_abono_id;

  UPDATE public.liga_jugador_pagos
  SET monto_pagado = v_nuevo_monto, estado = v_estado, updated_at = now()
  WHERE id = v_pago_id;

  v_resultado := jsonb_build_object(
    'pago_id', v_pago_id, 'abono_id', v_abono_id, 'movimiento_id', v_movimiento_id,
    'nuevo_estado', v_estado, 'nuevo_monto_pagado', v_nuevo_monto
  );
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_ultimo_abono_liga_atomico(
  p_pago_id uuid,
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
  v_monto_total integer; v_nuevo_monto integer; v_estado text;
  v_abono_id uuid; v_abono_monto integer; v_movimiento_id uuid; v_afectadas integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'anular_abono_liga');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT p.monto_total INTO v_monto_total
  FROM public.liga_jugador_pagos p
  JOIN public.liga_divisiones d ON d.id = p.division_id
  JOIN public.ligas l ON l.id = d.liga_id
  WHERE p.id = p_pago_id AND l.club_id = v_club_id
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago de liga no encontrado en el club'; END IF;

  SELECT id, monto, movimiento_id INTO v_abono_id, v_abono_monto, v_movimiento_id
  FROM public.liga_abonos
  WHERE pago_id = p_pago_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay abonos que anular'; END IF;

  IF v_movimiento_id IS NULL THEN
    RAISE EXCEPTION 'El último abono no tiene movimiento asociado; requiere conciliación manual';
  END IF;
  DELETE FROM public.movimientos WHERE id = v_movimiento_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 1 THEN RAISE EXCEPTION 'El movimiento asociado al abono no pertenece al club'; END IF;
  DELETE FROM public.liga_abonos WHERE id = v_abono_id;

  SELECT coalesce(sum(monto), 0)::integer INTO v_nuevo_monto
  FROM public.liga_abonos WHERE pago_id = p_pago_id;
  v_estado := CASE WHEN v_nuevo_monto = 0 THEN 'pendiente' WHEN v_nuevo_monto >= v_monto_total THEN 'pagado' ELSE 'parcial' END;

  UPDATE public.liga_jugador_pagos
  SET monto_pagado = v_nuevo_monto, estado = v_estado, updated_at = now()
  WHERE id = p_pago_id;

  v_resultado := jsonb_build_object('pago_id', p_pago_id, 'nuevo_estado', v_estado, 'nuevo_monto_pagado', v_nuevo_monto);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

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
  SET estado = 'pagado', fecha_pago = current_date, monto = p_monto, metodo = p_metodo
  WHERE id = v_mensualidad_id;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
    mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id
  ) VALUES (
    v_club_id, 'ingreso', 'mensualidad',
    'Mensualidad ' || v_jugador_nombre || ' — ' || v_meses[p_mes] || ' ' || p_anio,
    p_monto, current_date, p_jugador_id, p_mes, p_anio, v_admin_nombre, v_mensualidad_id
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

CREATE OR REPLACE FUNCTION public.revertir_pago_mensualidad_atomico(
  p_mensualidad_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_estado text;
  v_jugador_id uuid; v_mes integer; v_anio integer; v_monto numeric; v_metodo text;
  v_movimiento_id uuid; v_coincidencias integer; v_afectadas integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'revertir_mensualidad');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT estado, jugador_id, mes, anio, monto, metodo
    INTO v_estado, v_jugador_id, v_mes, v_anio, v_monto, v_metodo
  FROM public.mensualidades
  WHERE id = p_mensualidad_id AND club_id = v_club_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no encontrada en el club'; END IF;
  IF v_estado <> 'pagado' THEN RAISE EXCEPTION 'La mensualidad no está pagada'; END IF;

  SELECT id INTO v_movimiento_id FROM public.movimientos
  WHERE club_id = v_club_id AND mensualidad_id = p_mensualidad_id AND categoria = 'mensualidad';

  IF v_movimiento_id IS NULL THEN
    SELECT count(*)::integer, (array_agg(id ORDER BY id))[1] INTO v_coincidencias, v_movimiento_id
    FROM public.movimientos
    WHERE club_id = v_club_id AND categoria = 'mensualidad' AND mensualidad_id IS NULL
      AND jugador_id = v_jugador_id AND mes_correspondiente = v_mes AND anio_correspondiente = v_anio;
    IF v_coincidencias <> 1 THEN
      RAISE EXCEPTION 'No existe un único movimiento histórico asociado; requiere conciliación manual';
    END IF;
  END IF;

  DELETE FROM public.movimientos WHERE id = v_movimiento_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 1 THEN RAISE EXCEPTION 'No se pudo revertir el movimiento financiero'; END IF;

  UPDATE public.mensualidades
  SET estado = 'pendiente', fecha_pago = NULL, monto = NULL, metodo = NULL
  WHERE id = p_mensualidad_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, after, user_id)
  VALUES (v_club_id, 'mensualidades', p_mensualidad_id, 'revertir_pago',
    jsonb_build_object('monto', v_monto, 'metodo', v_metodo, 'movimiento_id', v_movimiento_id),
    jsonb_build_object('estado', 'pendiente'), v_user_id);

  v_resultado := jsonb_build_object('mensualidad_id', p_mensualidad_id, 'movimiento_id', v_movimiento_id, 'estado', 'pendiente');
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_financiero_atomico(
  p_tipo text,
  p_categoria text,
  p_descripcion text,
  p_monto integer,
  p_fecha date,
  p_profesor_id uuid,
  p_mes_correspondiente integer,
  p_anio_correspondiente integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_movimiento_id uuid;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ingreso', 'gasto') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF p_categoria IS NULL
     OR (p_tipo = 'ingreso' AND p_categoria NOT IN ('mensualidad','inscripcion_torneo','inscripcion_liga','arriendo_cancha','donacion','otro_ingreso'))
     OR (p_tipo = 'gasto' AND p_categoria NOT IN ('sueldo_profesor','sueldo_staff','arriendo_cancha','material_deportivo','servicios_basicos','mantenimiento','premio_torneo','otro_gasto')) THEN
    RAISE EXCEPTION 'Categoría incompatible con el tipo de movimiento';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF p_fecha IS NULL OR p_fecha < DATE '2000-01-01' OR p_fecha > DATE '2100-12-31' THEN RAISE EXCEPTION 'Fecha inválida'; END IF;
  IF nullif(btrim(p_descripcion), '') IS NULL OR length(btrim(p_descripcion)) > 500 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
  IF (p_mes_correspondiente IS NULL) <> (p_anio_correspondiente IS NULL) THEN RAISE EXCEPTION 'Mes y año deben informarse juntos'; END IF;
  IF p_mes_correspondiente IS NOT NULL AND (p_mes_correspondiente NOT BETWEEN 1 AND 12 OR p_anio_correspondiente NOT BETWEEN 2000 AND 2100) THEN RAISE EXCEPTION 'Mes o año inválido'; END IF;
  IF p_categoria IN ('sueldo_profesor','sueldo_staff') AND p_mes_correspondiente IS NULL THEN RAISE EXCEPTION 'Los sueldos requieren mes y año'; END IF;
  IF p_profesor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profesores WHERE id = p_profesor_id AND club_id = v_club_id) THEN RAISE EXCEPTION 'Profesor no encontrado en el club'; END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'movimiento_manual');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, profesor_id,
    mes_correspondiente, anio_correspondiente, registrado_por_nombre
  ) VALUES (
    v_club_id, p_tipo, p_categoria, btrim(p_descripcion), p_monto, p_fecha, p_profesor_id,
    p_mes_correspondiente, p_anio_correspondiente, v_admin_nombre
  ) RETURNING id INTO v_movimiento_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'movimientos', v_movimiento_id, 'crear',
    jsonb_build_object('tipo', p_tipo, 'categoria', p_categoria, 'monto', p_monto), v_user_id);

  v_resultado := jsonb_build_object('movimiento_id', v_movimiento_id);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_mensualidades_jugadores_seguro(
  p_jugador_ids uuid[],
  p_mes integer,
  p_anio integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text; v_insertadas integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Mes o año inválido'; END IF;
  IF p_jugador_ids IS NULL OR cardinality(p_jugador_ids) > 1000 OR array_position(p_jugador_ids, NULL) IS NOT NULL THEN RAISE EXCEPTION 'Lista de jugadores inválida'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_jugador_ids) AS input(jugador_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = input.jugador_id AND j.club_id = v_club_id)
  ) THEN RAISE EXCEPTION 'Uno o más jugadores no pertenecen al club'; END IF;

  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT DISTINCT v_club_id, j.id, p_mes, p_anio, 'pendiente',
    coalesce(j.mensualidad, CASE j.sesiones_limite WHEN 4 THEN 15000 WHEN 8 THEN 25000 WHEN 12 THEN 30000 WHEN 16 THEN 40000 ELSE 25000 END)
  FROM public.jugadores j
  JOIN unnest(p_jugador_ids) AS input(jugador_id) ON input.jugador_id = j.id
  WHERE j.club_id = v_club_id
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_mensualidad_atrasada_seguro(p_mensualidad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text; v_estado text;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  SELECT estado INTO v_estado FROM public.mensualidades
  WHERE id = p_mensualidad_id AND club_id = v_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no encontrada en el club'; END IF;
  IF v_estado = 'pagado' THEN RAISE EXCEPTION 'No se puede atrasar una mensualidad pagada'; END IF;
  IF v_estado IS NULL OR v_estado NOT IN ('pendiente', 'atrasado') THEN RAISE EXCEPTION 'Estado de mensualidad inválido'; END IF;
  UPDATE public.mensualidades SET estado = 'atrasado' WHERE id = p_mensualidad_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_liga_atomico(uuid, uuid, integer, integer, date, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.anular_ultimo_abono_liga_atomico(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_mensualidad_atomico(uuid, uuid, integer, integer, integer, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revertir_pago_mensualidad_atomico(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_financiero_atomico(text, text, text, integer, date, uuid, integer, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generar_mensualidades_jugadores_seguro(uuid[], integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_mensualidad_atrasada_seguro(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_pago_liga_atomico(uuid, uuid, integer, integer, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_ultimo_abono_liga_atomico(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mensualidad_atomico(uuid, uuid, integer, integer, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revertir_pago_mensualidad_atomico(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_financiero_atomico(text, text, text, integer, date, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_mensualidades_jugadores_seguro(uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_mensualidad_atrasada_seguro(uuid) TO authenticated;

COMMIT;
