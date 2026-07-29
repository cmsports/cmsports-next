-- CmSports — las cuotas del mes se emiten solas
--
-- Hasta ahora las mensualidades de un mes nacían cuando un admin abría la
-- pestaña Mensualidades: la generación vive en el cliente
-- (src/components/MensualidadesPanel.tsx). Si nadie entraba hasta el 5, las
-- cuotas del mes no existían hasta el 5, y mientras tanto el dashboard
-- mostraba 0% de morosidad — que no es "nadie debe", es "no hay nada emitido".
--
-- Esta función hace lo mismo que ya hace la pantalla, pero sin depender de que
-- alguien entre. No reemplaza a `generar_mensualidades_jugadores_seguro`: esa
-- sigue siendo la que usa el admin desde la app, con su contexto y su lista
-- explícita de jugadores. Esta es para el cron, que no tiene sesión.
--
-- El monto sale de la cuota del jugador y de ningún otro lado. Si no tiene,
-- queda en NULL y la pantalla muestra "Cuota por asignar" (ver migración 097:
-- estimar el monto por el plan de sesiones ya se descartó una vez).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.emitir_mensualidades_mes_actual(
  p_club_id uuid DEFAULT NULL   -- NULL = todos los clubes
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- El mes se toma en Santiago, no en UTC: entre las 21:00 y la medianoche del
  -- 31 el servidor ya está en el mes siguiente, y emitiría un mes antes de
  -- tiempo para todo el club.
  v_hoy  date    := (now() AT TIME ZONE 'America/Santiago')::date;
  v_mes  integer := extract(month from v_hoy)::integer;
  v_anio integer := extract(year  from v_hoy)::integer;
  v_insertadas integer;
BEGIN
  -- Mismo universo que arma la pantalla: activos y no externos. La función que
  -- usa el admin no filtra porque recibe la lista ya elegida desde el cliente;
  -- acá no hay cliente, así que el filtro tiene que estar.
  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT j.club_id, j.id, v_mes, v_anio, 'pendiente', j.mensualidad
  FROM public.jugadores j
  WHERE j.club_id IS NOT NULL
    AND (p_club_id IS NULL OR j.club_id = p_club_id)
    AND j.estado = 'activo'
    AND (j.es_externo IS NULL OR j.es_externo = false)
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emitir_mensualidades_mes_actual(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;


-- ══ El cron ═══════════════════════════════════════════════════════════════
-- Corre TODOS los días, no solo el 1. Dos motivos: no hay que acertarle a la
-- medianoche ni pelear con el horario de verano de Chile, y el jugador que se
-- da de alta el 10 tiene su cuota esa misma noche en vez de esperar a que un
-- admin abra la pestaña. `ON CONFLICT DO NOTHING` hace que repetirlo no cueste
-- nada: el segundo pase del mes inserta cero filas.
--
-- ⚠ ALCANCE: queda atado al club Asociación Buin a propósito. Para abrirlo a
-- todos los clubes de la plataforma, cambiar la llamada de abajo por
-- `SELECT public.emitir_mensualidades_mes_actual()` sin argumento.
DO $$
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
  IF NOT FOUND THEN
    RAISE NOTICE 'pg_cron no está habilitado: activalo en Dashboard > Database > Extensions y volvé a correr solo este bloque. La función ya quedó creada y se puede llamar a mano.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('emitir-mensualidades-mes');
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- no existía todavía
  END;

  PERFORM cron.schedule(
    'emitir-mensualidades-mes',
    '0 4 * * *',
    $cron$SELECT public.emitir_mensualidades_mes_actual('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc')$cron$
  );
  RAISE NOTICE 'Cron programado: emitir-mensualidades-mes, todos los días 04:00 UTC (00:00/01:00 de Santiago).';
END;
$$;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1. Prueba en seco. Hoy es julio y las cuotas de julio ya están emitidas, así
--    que esto tiene que devolver 0. Si devuelve más, había gente sin cuota
--    emitida este mes y ahora la tiene (que es lo correcto).
SELECT public.emitir_mensualidades_mes_actual('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc') AS emitidas_ahora;

-- 2. A quién le va a caer una cuota SIN MONTO cuando se emita agosto.
--    Conviene asignarles la cuota antes del 1.
SELECT nombre, coalesce(mensualidad::text, '⚠ SIN CUOTA ASIGNADA') AS cuota
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND estado = 'activo'
  AND (es_externo IS NULL OR es_externo = false)
  AND mensualidad IS NULL
ORDER BY nombre;

-- 3. Los dos cron quedaron anotados.
DO $$
DECLARE v_fila record;
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
  IF NOT FOUND THEN
    RAISE NOTICE 'pg_cron no habilitado — sin cron programado.';
    RETURN;
  END IF;
  FOR v_fila IN EXECUTE
    $q$SELECT jobname, schedule, active FROM cron.job
       WHERE jobname IN ('emitir-mensualidades-mes','recalcular-sesiones-mensuales')
       ORDER BY jobname$q$
  LOOP
    RAISE NOTICE 'cron: % | % | activo=%', v_fila.jobname, v_fila.schedule, v_fila.active;
  END LOOP;
END;
$$;
