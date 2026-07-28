-- Cobrar la clase extraordinaria: que llegue al libro como ingreso.
--
-- LO QUE HOY LO IMPIDE. `registrar_movimiento_financiero_atomico` valida la
-- categoría contra una lista blanca escrita dentro de la propia función:
--
--   p_categoria NOT IN ('mensualidad','inscripcion_torneo','inscripcion_liga',
--                       'arriendo_cancha','donacion','otro_ingreso')
--     → RAISE EXCEPTION 'Categoría incompatible con el tipo de movimiento'
--
-- Una categoría nueva es rechazada hasta que esa lista la incluya.
--
-- LOS CUATRO ESTADOS de una clase extra, en orden:
--
--   monto NULL                        por asignar    — no se puede cobrar
--   monto puesto, cobrada_en NULL     por enviar     — el profe le puso precio
--   cobrada_en puesto, pagada_en NULL por cobrar     — se le está cobrando
--   pagada_en puesto                  pagada         — hay un movimiento detrás
--
-- El cobro NO se suma al monto de la mensualidad. Se hizo aparte a propósito:
-- mutar la cuota rompe la corrección histórica y su auditoría, y encima sería
-- imposible cuando el mes ya está pagado. "Costo clase extra" en el perfil es
-- la suma de las extras impagas, no una cuota distinta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. La categoría nueva entra en la lista blanca ════════════════════════
-- Se reescribe entera porque la lista vive dentro del cuerpo de la función.
-- Lo único que cambia respecto de la 039 es 'clase_extraordinaria'.
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_movimiento_id uuid;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ingreso', 'gasto') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF p_categoria IS NULL
     OR (p_tipo = 'ingreso' AND p_categoria NOT IN ('mensualidad','inscripcion_torneo','inscripcion_liga','arriendo_cancha','donacion','clase_extraordinaria','otro_ingreso'))
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


-- ══ 2. Enviar a cobro ═════════════════════════════════════════════════════
-- Separa "le puse precio" de "se lo estoy cobrando". Sin monto no se puede:
-- mandar a cobro algo sin precio es mandar una deuda en blanco.
CREATE OR REPLACE FUNCTION public.enviar_clases_extra_a_cobro(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid; v_rol text; v_n integer;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden enviar a cobro';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'Lista de clases inválida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM clases_extraordinarias
    WHERE id = ANY(p_ids) AND club_id = v_club AND monto IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay clases sin monto asignado: primero hay que ponerles precio';
  END IF;

  UPDATE clases_extraordinarias
  SET cobrada_en = now()
  WHERE id = ANY(p_ids) AND club_id = v_club AND pagada_en IS NULL AND cobrada_en IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


-- ══ 3. Cobrarlas ══════════════════════════════════════════════════════════
-- Varias en un solo movimiento: el profe cobra "las tres clases extra de
-- Cristóbal", no una por una. Todas tienen que ser del mismo jugador, porque
-- el movimiento lleva un jugador_id y con dos no significaría nada.
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
    v_total, current_date, v_jugador_id, v_admin_nombre
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


-- ══ 4. Deshacer el cobro ══════════════════════════════════════════════════
-- Mismo criterio que la mensualidad: borra el movimiento y devuelve las clases
-- a "por cobrar". Es lo que permite corregir un monto mal puesto.
CREATE OR REPLACE FUNCTION public.revertir_pago_clases_extra_atomico(
  p_movimiento_id   uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_categoria text; v_afectadas integer; v_clases integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'revertir_clases_extra');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT categoria INTO v_categoria FROM public.movimientos
  WHERE id = p_movimiento_id AND club_id = v_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado en el club'; END IF;
  IF v_categoria IS DISTINCT FROM 'clase_extraordinaria' THEN
    RAISE EXCEPTION 'Ese movimiento no es un cobro de clases extra';
  END IF;

  UPDATE clases_extraordinarias
  SET pagada_en = NULL, movimiento_id = NULL
  WHERE movimiento_id = p_movimiento_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_clases = ROW_COUNT;

  DELETE FROM public.movimientos WHERE id = p_movimiento_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 1 THEN RAISE EXCEPTION 'No se pudo revertir el movimiento'; END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, user_id)
  VALUES (v_club_id, 'clases_extraordinarias', p_movimiento_id, 'revertir_pago',
    jsonb_build_object('movimiento_id', p_movimiento_id, 'clases', v_clases), v_user_id);

  v_resultado := jsonb_build_object('movimiento_id', p_movimiento_id, 'clases', v_clases);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.enviar_clases_extra_a_cobro(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_clases_extra_atomico(uuid[], text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revertir_pago_clases_extra_atomico(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.enviar_clases_extra_a_cobro(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_clases_extra_atomico(uuid[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revertir_pago_clases_extra_atomico(uuid, uuid) TO authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'enviar_clases_extra_a_cobro',
      'registrar_pago_clases_extra_atomico',
      'revertir_pago_clases_extra_atomico'))                    AS funciones_nuevas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'registrar_movimiento_financiero_atomico'
      AND pg_get_functiondef(p.oid) LIKE '%clase_extraordinaria%') AS categoria_habilitada,
  (SELECT count(*) FROM clases_extraordinarias WHERE pagada_en IS NOT NULL) AS ya_cobradas;
