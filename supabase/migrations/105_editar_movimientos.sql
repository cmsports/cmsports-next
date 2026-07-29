-- CmSports — editar y borrar movimientos cargados a mano
--
-- Hasta acá un movimiento se escribía una vez y quedaba así para siempre. Un
-- monto mal tipeado solo se podía "arreglar" cargando otro movimiento al lado,
-- que deja el libro con dos filas donde hubo un solo gasto.
--
-- Lo que NO se toca desde acá: los movimientos que son el reflejo de otra cosa
-- —el pago de una mensualidad, la inscripción a una liga, el cobro de una clase
-- extra, la plata de un torneo—. Esos tienen su propia pantalla con su propia
-- reversa, y editarlos por el costado dejaría al origen diciendo una cosa y al
-- libro otra. La función los rechaza con el nombre de dónde se corrigen.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ Guardia compartida ════════════════════════════════════════════════════
-- Devuelve el tipo del movimiento si es de carga manual. Si viene de otro
-- módulo, corta con el mensaje que dice dónde se corrige de verdad.
CREATE OR REPLACE FUNCTION public._movimiento_editable(
  p_movimiento_id uuid,
  p_club_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text; v_categoria text; v_mensualidad_id uuid; v_torneo_id uuid;
BEGIN
  SELECT tipo, categoria, mensualidad_id, torneo_id
    INTO v_tipo, v_categoria, v_mensualidad_id, v_torneo_id
  FROM public.movimientos
  WHERE id = p_movimiento_id AND club_id = p_club_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado en el club';
  END IF;

  IF v_mensualidad_id IS NOT NULL OR v_categoria = 'mensualidad' THEN
    RAISE EXCEPTION 'Este movimiento es el pago de una mensualidad. Se corrige en la pestaña Mensualidades, revirtiendo el pago.';
  END IF;
  IF v_torneo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este movimiento viene de un torneo. Se corrige desde la ficha del torneo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.liga_abonos WHERE movimiento_id = p_movimiento_id) THEN
    RAISE EXCEPTION 'Este movimiento es un abono de liga. Se corrige anulando el abono desde la liga.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clases_extraordinarias WHERE movimiento_id = p_movimiento_id) THEN
    RAISE EXCEPTION 'Este movimiento es el cobro de clases extra. Se corrige revirtiendo el cobro en Clases extra.';
  END IF;

  RETURN v_tipo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._movimiento_editable(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ══ Editar ════════════════════════════════════════════════════════════════
-- El tipo (ingreso/gasto) no se puede cambiar: pasar un gasto a ingreso da
-- vuelta el balance de un mes ya cerrado sin dejar rastro de que eran cosas
-- distintas. Si se cargó con el tipo equivocado, se borra y se carga de nuevo.
CREATE OR REPLACE FUNCTION public.editar_movimiento_financiero_atomico(
  p_movimiento_id uuid,
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
  v_repetida jsonb; v_resultado jsonb; v_tipo text; v_antes jsonb;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'editar_movimiento');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  v_tipo := public._movimiento_editable(p_movimiento_id, v_club_id);

  IF p_categoria IS NULL
     OR (v_tipo = 'ingreso' AND p_categoria NOT IN ('inscripcion_torneo','inscripcion_liga','arriendo_cancha','donacion','otro_ingreso'))
     OR (v_tipo = 'gasto' AND p_categoria NOT IN ('sueldo_profesor','sueldo_staff','arriendo_cancha','material_deportivo','servicios_basicos','mantenimiento','premio_torneo','otro_gasto')) THEN
    RAISE EXCEPTION 'Categoría incompatible con el tipo de movimiento';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF p_fecha IS NULL OR p_fecha < DATE '2000-01-01' OR p_fecha > DATE '2100-12-31' THEN RAISE EXCEPTION 'Fecha inválida'; END IF;
  IF nullif(btrim(p_descripcion), '') IS NULL OR length(btrim(p_descripcion)) > 500 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
  IF (p_mes_correspondiente IS NULL) <> (p_anio_correspondiente IS NULL) THEN RAISE EXCEPTION 'Mes y año deben informarse juntos'; END IF;
  IF p_mes_correspondiente IS NOT NULL AND (p_mes_correspondiente NOT BETWEEN 1 AND 12 OR p_anio_correspondiente NOT BETWEEN 2000 AND 2100) THEN RAISE EXCEPTION 'Mes o año inválido'; END IF;
  IF p_categoria IN ('sueldo_profesor','sueldo_staff') AND p_mes_correspondiente IS NULL THEN RAISE EXCEPTION 'Los sueldos requieren mes y año'; END IF;
  IF p_profesor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profesores WHERE id = p_profesor_id AND club_id = v_club_id) THEN RAISE EXCEPTION 'Profesor no encontrado en el club'; END IF;

  SELECT jsonb_build_object(
    'categoria', categoria, 'descripcion', descripcion, 'monto', monto, 'fecha', fecha,
    'profesor_id', profesor_id, 'mes_correspondiente', mes_correspondiente,
    'anio_correspondiente', anio_correspondiente
  ) INTO v_antes
  FROM public.movimientos WHERE id = p_movimiento_id;

  UPDATE public.movimientos SET
    categoria = p_categoria,
    descripcion = btrim(p_descripcion),
    monto = p_monto,
    fecha = p_fecha,
    profesor_id = p_profesor_id,
    mes_correspondiente = p_mes_correspondiente,
    anio_correspondiente = p_anio_correspondiente
  WHERE id = p_movimiento_id AND club_id = v_club_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, after, user_id)
  VALUES (v_club_id, 'movimientos', p_movimiento_id, 'editar', v_antes,
    jsonb_build_object(
      'categoria', p_categoria, 'descripcion', btrim(p_descripcion), 'monto', p_monto,
      'fecha', p_fecha, 'profesor_id', p_profesor_id,
      'mes_correspondiente', p_mes_correspondiente, 'anio_correspondiente', p_anio_correspondiente
    ), v_user_id);

  v_resultado := jsonb_build_object('movimiento_id', p_movimiento_id);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;


-- ══ Borrar ════════════════════════════════════════════════════════════════
-- Borrado real, igual que las reversas que ya existen. El audit_log se queda
-- con la fila entera en `before`, así que el dato no desaparece del todo.
CREATE OR REPLACE FUNCTION public.eliminar_movimiento_financiero_atomico(
  p_movimiento_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_antes jsonb; v_afectadas integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'eliminar_movimiento');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  PERFORM public._movimiento_editable(p_movimiento_id, v_club_id);

  SELECT to_jsonb(m) INTO v_antes FROM public.movimientos m WHERE m.id = p_movimiento_id;

  DELETE FROM public.movimientos WHERE id = p_movimiento_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 1 THEN RAISE EXCEPTION 'No se pudo eliminar el movimiento'; END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, user_id)
  VALUES (v_club_id, 'movimientos', p_movimiento_id, 'eliminar', v_antes, v_user_id);

  v_resultado := jsonb_build_object('movimiento_id', p_movimiento_id);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_movimiento_financiero_atomico(uuid, text, text, integer, date, uuid, integer, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eliminar_movimiento_financiero_atomico(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.editar_movimiento_financiero_atomico(uuid, text, text, integer, date, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_movimiento_financiero_atomico(uuid, uuid) TO authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('editar_movimiento_financiero_atomico','eliminar_movimiento_financiero_atomico','_movimiento_editable');
