-- Estado `exento` para mensualidades: el botón "No vino este mes".
--
-- ── Para qué ──────────────────────────────────────────────────────────────
-- Un jugador que no vino en el mes, o que tiene beca, o al que el club le
-- condona la cuota. Hoy no hay forma de reflejarlo y queda en uno de dos
-- lugares malos:
--
--   · Deudor eterno — la cuota nunca pasa a `pagado`, así que ensucia la tasa
--     de morosidad del dashboard y aparece siempre en la lista de deudores.
--   · Con un pago inventado — se registra plata que nunca entró y Finanzas
--     miente.
--
-- `exento` resuelve las dos: sale de lo pendiente sin decir que se pagó.
--
-- Es el mismo patrón que ya usa `torneo_pagos` desde la migración 192, con el
-- botón "Se retiró". Mismo nombre de estado a propósito, para que el
-- vocabulario sea uno solo en todo el sistema.
--
-- ── El movimiento en $0 ───────────────────────────────────────────────────
-- Por decisión del club, eximir SÍ deja una línea en Finanzas, con monto 0.
-- No mueve ningún total —cero es cero— pero deja el mes exento visible en el
-- libro y no solo en la ficha del jugador.
--
-- Para eso hace falta aflojar el CHECK de `movimientos.monto`, que hoy exige
-- mayor a cero. Hay precedente exacto en la migración 100, que hizo lo mismo
-- con `clases_extraordinarias` para la clase sin cargo: el criterio del
-- proyecto ya es que cero es un monto válido cuando significa "sin cobro".
--
-- El índice único `movimientos_pago_mensualidad_uidx` sigue mandando: una sola
-- fila de movimiento por mensualidad. O está pagada o está exenta, nunca las
-- dos.
--
-- ── Lo que NO hace ────────────────────────────────────────────────────────
-- Eximir un mes no toca los demás. El mes siguiente se emite normal, como
-- corresponde: la exención es de ese mes y de ninguno más.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('203_mensualidad_exenta');

-- ── 1. Permitir monto 0 en movimientos ───────────────────────────────────
-- Se busca el CHECK por su definición y no por un nombre fijo, porque la
-- tabla se creó desde el panel y su constraint puede llamarse de cualquier
-- forma en distintas bases.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public' AND cls.relname = 'movimientos' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ~* 'monto\s*>\s*0'
  LOOP
    EXECUTE format('ALTER TABLE public.movimientos DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'CHECK de monto > 0 eliminado: %', c.conname;
  END LOOP;
END $$;

ALTER TABLE public.movimientos DROP CONSTRAINT IF EXISTS movimientos_monto_no_negativo;
ALTER TABLE public.movimientos ADD CONSTRAINT movimientos_monto_no_negativo
  CHECK (monto IS NULL OR monto >= 0);

-- ── 2. Aceptar el estado `exento` en mensualidades ───────────────────────
-- El CHECK tampoco tiene nombre garantizado: misma búsqueda por definición.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public' AND cls.relname = 'mensualidades' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ~* 'estado'
  LOOP
    EXECUTE format('ALTER TABLE public.mensualidades DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'CHECK de estado eliminado: %', c.conname;
  END LOOP;
END $$;

ALTER TABLE public.mensualidades ADD CONSTRAINT mensualidades_estado_check
  CHECK (estado IN ('pendiente', 'atrasado', 'pagado', 'exento'));

-- ── 3. El RPC que exime ──────────────────────────────────────────────────
-- Mismo molde que los demás de finanzas: contexto de admin, idempotencia,
-- lock por jugador y mes, y rastro en audit_log.
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

  INSERT INTO public.audit_log (entity_type, entity_id, action, after, user_id)
  VALUES ('mensualidades', p_mensualidad_id, 'eximir',
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

-- ── 4. Deshacer la exención ──────────────────────────────────────────────
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

  INSERT INTO public.audit_log (entity_type, entity_id, action, after, user_id)
  VALUES ('mensualidades', p_mensualidad_id, 'revertir_exencion',
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


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) El estado exento tiene que estar permitido.
SELECT pg_get_constraintdef(oid) AS estados_permitidos
FROM pg_constraint
WHERE conrelid = 'public.mensualidades'::regclass AND conname = 'mensualidades_estado_check';

-- 2) Y el monto 0 también.
SELECT pg_get_constraintdef(oid) AS monto_permitido
FROM pg_constraint
WHERE conrelid = 'public.movimientos'::regclass AND conname = 'movimientos_monto_no_negativo';

-- 3) Las dos funciones nuevas, con su search_path fijo.
SELECT proname, prosecdef AS es_definer,
       coalesce(array_to_string(proconfig, ', '), '(sin search_path)') AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('eximir_mensualidad_atomico', 'revertir_exencion_mensualidad');
