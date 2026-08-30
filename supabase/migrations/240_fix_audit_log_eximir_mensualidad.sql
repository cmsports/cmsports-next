-- ────────────────────────────────────────────────────────────
-- "No vino" y su "Deshacer" están rotos desde que existen: la 203 creó
-- `eximir_mensualidad_atomico` y `revertir_exencion_mensualidad` insertando en
-- `audit_log` sin la columna `club_id`. La 041 le había puesto a esa tabla la
-- restricción `audit_log_club_id_present` (NOT NULL), validada en la 043 —
-- ambas migraciones anteriores a la 203, así que el INSERT nunca llegó a
-- funcionar ni un día: cualquier admin que tocara "No vino" se encontraba con
--
--   new row for relation "audit_log" violates check constraint
--   "audit_log_club_id_present"
--
-- y la cuota se quedaba sin eximir. Las otras siete funciones que escriben en
-- audit_log (039, 099, 105, 116, 138) sí traen `club_id` desde el principio;
-- esta es la única que se armó copiando una versión más vieja de la firma.
--
-- Acá se redefinen las dos funciones agregando `club_id` al INSERT. Nada más
-- cambia: misma lógica, mismos parámetros, mismos permisos.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('240_fix_audit_log_eximir_mensualidad');

CREATE OR REPLACE FUNCTION public.eximir_mensualidad_atomico(
  p_mensualidad_id  uuid,
  p_motivo          text,
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
  v_jugador_id uuid; v_jugador_nombre text;
  v_mes int; v_anio int; v_estado text; v_movimiento_id uuid;
  v_meses text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'eximir_mensualidad');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT m.jugador_id, m.mes, m.anio, m.estado
    INTO v_jugador_id, v_mes, v_anio, v_estado
  FROM public.mensualidades m
  WHERE m.id = p_mensualidad_id AND m.club_id = v_club_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no encontrada en el club'; END IF;
  IF v_estado = 'pagado' THEN
    RAISE EXCEPTION 'Esa cuota ya está pagada: revierte el pago antes de eximirla';
  END IF;
  IF v_estado = 'exento' THEN RAISE EXCEPTION 'Esa cuota ya está exenta'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'mensualidad:' || v_club_id::text || ':' || v_jugador_id::text || ':' || v_anio::text || ':' || v_mes::text, 0));

  SELECT nombre INTO v_jugador_nombre FROM public.jugadores WHERE id = v_jugador_id;

  UPDATE public.mensualidades
     SET estado = 'exento', fecha_pago = NULL, metodo = NULL,
         notas = coalesce(nullif(btrim(p_motivo), ''), 'No vino este mes')
   WHERE id = p_mensualidad_id;

  -- Movimiento en 0: no mueve totales, pero deja el mes exento en el libro.
  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha,
    jugador_id, mes_correspondiente, anio_correspondiente,
    registrado_por_nombre, mensualidad_id
  ) VALUES (
    v_club_id, 'ingreso', 'mensualidad',
    'Mensualidad ' || v_meses[v_mes] || ' ' || v_anio || ' — ' ||
      coalesce(v_jugador_nombre, 'jugador') || ' (exenta: ' ||
      coalesce(nullif(btrim(p_motivo), ''), 'no vino este mes') || ')',
    0, v_hoy, v_jugador_id, v_mes, v_anio, v_admin_nombre, p_mensualidad_id
  ) RETURNING id INTO v_movimiento_id;

  -- FIX: faltaba club_id. Sin esto el INSERT viola audit_log_club_id_present
  -- y toda la función se revierte — la cuota tampoco quedaba exenta.
  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'mensualidades', p_mensualidad_id, 'eximir',
          jsonb_build_object('motivo', p_motivo, 'movimiento_id', v_movimiento_id,
                             'estado_anterior', v_estado),
          v_user_id);

  v_resultado := jsonb_build_object('mensualidad_id', p_mensualidad_id,
                                    'movimiento_id', v_movimiento_id,
                                    'estado', 'exento');
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
   WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.eximir_mensualidad_atomico(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eximir_mensualidad_atomico(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revertir_exencion_mensualidad(
  p_mensualidad_id  uuid,
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
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'revertir_exencion');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  SELECT estado INTO v_estado FROM public.mensualidades
  WHERE id = p_mensualidad_id AND club_id = v_club_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no encontrada en el club'; END IF;
  IF v_estado <> 'exento' THEN RAISE EXCEPTION 'Esa cuota no está exenta'; END IF;

  -- Se borra el movimiento en 0, que no representa plata.
  DELETE FROM public.movimientos
   WHERE mensualidad_id = p_mensualidad_id AND categoria = 'mensualidad' AND monto = 0;

  UPDATE public.mensualidades SET estado = 'pendiente', notas = NULL
   WHERE id = p_mensualidad_id;

  -- FIX: mismo olvido de club_id que en eximir_mensualidad_atomico.
  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'mensualidades', p_mensualidad_id, 'revertir_exencion',
          jsonb_build_object('estado', 'pendiente'), v_user_id);

  v_resultado := jsonb_build_object('mensualidad_id', p_mensualidad_id, 'estado', 'pendiente');
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
   WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_exencion_mensualidad(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_exencion_mensualidad(uuid, uuid) TO authenticated;

COMMIT;

-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Las dos funciones quedaron con la firma esperada.
SELECT proname, pronargs FROM pg_proc
WHERE proname IN ('eximir_mensualidad_atomico', 'revertir_exencion_mensualidad');

-- 2) Prueba real: tomar el id de una mensualidad 'pendiente' o 'atrasado' del
--    propio club y confirmar que esto YA NO tira el error de audit_log:
--    SELECT public.eximir_mensualidad_atomico('<id-mensualidad>', 'prueba', gen_random_uuid());
--    (revertir después con revertir_exencion_mensualidad, mismo id)
