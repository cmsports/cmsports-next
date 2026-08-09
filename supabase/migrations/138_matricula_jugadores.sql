-- La matrícula del jugador: si la pagó, cuánto, y su ingreso en Finanzas.
--
-- ── El estado inicial ─────────────────────────────────────────────────────
-- Todos los jugadores que ya existen quedan marcados como matrícula pagada,
-- con monto NULL y SIN generar ningún movimiento. El club viene funcionando
-- desde antes de esta columna: dar por pagada su matrícula es reconocer lo que
-- ya pasó, pero inventarles un ingreso sería fabricar plata que nunca entró y
-- descuadrar meses ya cerrados. `matricula_monto NULL` es justamente eso:
-- "está pagada, no sabemos de cuánto" — distinto de 0, que significa "se marcó
-- como pagada sin cobrar nada".
--
-- ── Por qué un RPC y no dos escrituras sueltas ────────────────────────────
-- Marcar la matrícula y registrar su ingreso tienen que ocurrir juntos o no
-- ocurrir. Si se hicieran por separado desde la Server Action y la segunda
-- fallara, quedaría un jugador marcado como pagado sin su ingreso (plata que
-- el club recibió y no figura) o un ingreso sin el flag. Es el mismo patrón
-- que ya usan mensualidades, liga y premios de torneo.
--
-- ── La categoría nueva ────────────────────────────────────────────────────
-- `registrar_movimiento_financiero_atomico` valida la categoría contra una
-- lista blanca cerrada. Sin agregar 'matricula' ahí, el movimiento se rechaza
-- y además el admin no podría cargar una matrícula a mano desde Finanzas.
--
-- ── Y de paso: se borra la vista division_ranking ─────────────────────────
-- La migración 137 le puso security_invoker para tapar que entregaba nombres y
-- estadísticas de todos los clubes a cualquiera con la llave pública. Al
-- revisarla se vio que además no la usa nadie: el ranking de liga se calcula
-- en el cliente con `calcularRankingDivision`. Una vista que nadie consulta
-- solo es superficie de ataque, así que se elimina — mismo criterio que la
-- 133 con club_photos y la 136 con presupuesto_vs_real.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('138_matricula_jugadores');


-- ══ 1. Las columnas ═══════════════════════════════════════════════════════
-- El DEFAULT true es lo que deja marcados a los que ya existen, sin un UPDATE
-- aparte: la columna nace con ese valor para toda fila previa.
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS matricula_pagada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS matricula_monto  integer,
  ADD COLUMN IF NOT EXISTS matricula_fecha  date;

COMMENT ON COLUMN public.jugadores.matricula_monto IS
  'NULL = pagada pero de monto desconocido (jugadores anteriores a la migración 138). 0 = se marcó pagada sin cobrar. >0 = tiene su ingreso en movimientos.';


-- ══ 2. 'matricula' entra a la lista blanca de ingresos ════════════════════
-- Mismo cuerpo que la migración 039, con la categoría agregada.
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
     OR (p_tipo = 'ingreso' AND p_categoria NOT IN ('mensualidad','matricula','inscripcion_torneo','inscripcion_liga','arriendo_cancha','donacion','otro_ingreso'))
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


-- ══ 3. Cobrar la matrícula ════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_pago_matricula_atomico(
  p_jugador_id uuid,
  p_monto integer,
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
  v_nombre text; v_movimiento_id uuid;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  -- El jugador tiene que ser del club de quien llama: sin esto, un admin
  -- podría marcarle la matrícula a un jugador de otro club pasando su id.
  SELECT nombre INTO v_nombre
  FROM public.jugadores WHERE id = p_jugador_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;

  -- 0 es válido y significa "queda pagada sin cobrar nada": el club a veces
  -- exime la matrícula. Negativo no.
  IF p_monto IS NULL OR p_monto < 0 THEN RAISE EXCEPTION 'El monto no puede ser negativo'; END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'pago_matricula');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  UPDATE public.jugadores
  SET matricula_pagada = true, matricula_monto = p_monto, matricula_fecha = v_fecha
  WHERE id = p_jugador_id AND club_id = v_club_id;

  -- Solo hay movimiento si entró plata. Marcar en 0 deja el flag puesto y
  -- Finanzas intacto, que es lo correcto: no hubo ingreso que registrar.
  IF p_monto > 0 THEN
    INSERT INTO public.movimientos (
      club_id, jugador_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre
    ) VALUES (
      v_club_id, p_jugador_id, 'ingreso', 'matricula',
      'Matrícula — ' || v_nombre, p_monto, v_fecha, v_admin_nombre
    ) RETURNING id INTO v_movimiento_id;

    INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
    VALUES (v_club_id, 'movimientos', v_movimiento_id, 'crear',
      jsonb_build_object('tipo', 'ingreso', 'categoria', 'matricula', 'monto', p_monto,
                         'jugador_id', p_jugador_id), v_user_id);
  END IF;

  v_resultado := jsonb_build_object('movimiento_id', v_movimiento_id, 'monto', p_monto);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_matricula_atomico(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_matricula_atomico(uuid, integer, uuid) TO authenticated;


-- ══ 4. Fuera la vista que nadie usa ═══════════════════════════════════════
DROP VIEW IF EXISTS public.division_ranking;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) Las columnas, y que todos hayan quedado marcados sin monto:
SELECT count(*) AS jugadores,
       count(*) FILTER (WHERE matricula_pagada) AS marcados,
       count(*) FILTER (WHERE matricula_monto IS NOT NULL) AS deberia_ser_cero
FROM jugadores;

-- 2) El RPC nuevo existe y la categoría entró a la lista blanca:
SELECT proname,
       prosrc ILIKE '%matricula%' AS menciona_matricula
FROM pg_proc
WHERE proname IN ('registrar_pago_matricula_atomico', 'registrar_movimiento_financiero_atomico');

-- 3) La vista ya no está (0 filas es lo correcto):
SELECT count(*) AS deberia_ser_cero
FROM pg_class WHERE relname = 'division_ranking';
