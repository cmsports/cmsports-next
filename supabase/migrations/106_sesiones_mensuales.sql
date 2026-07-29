-- CmSports — las sesiones usadas pasan a ser del mes, no de toda la vida
--
-- `sesiones_usadas` se venía sumando desde siempre: `recalcular_sesiones`
-- contaba TODA la tabla `asistencia` de un jugador, sin filtro de fecha. Con un
-- plan de 12 sesiones, al segundo mes el perfil decía "18/12" y el número
-- dejaba de significar algo. El plan es mensual, así que el contador también.
--
-- La decisión de 087 sigue en pie: la ausencia gasta sesión igual que la
-- presencia, porque el cupo se ocupó. Las dos son filas de `asistencia`
-- (presente / ausente), así que contar filas ya cuenta las dos.
--
-- Cómo funciona el "reset":
--   No hay reset. El conteo se define contra el mes en curso, así que el 1 a
--   las 00:00 de Santiago la cuenta arranca sola en cero, y el cambio de año
--   no es un caso especial. El cron de abajo existe solo para que el número
--   guardado se ponga al día sin esperar a que el jugador vuelva a entrenar.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. El conteo, acotado al mes en curso ═════════════════════════════════
-- La fecha se toma en America/Santiago y no en UTC: entre las 21:00 y la
-- medianoche de un 31, el servidor ya está en el mes siguiente y el corte
-- caería un día antes para todo el club.
CREATE OR REPLACE FUNCTION public.recalcular_sesiones(p_jugador uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE jugadores SET sesiones_usadas = (
    SELECT count(*)
    FROM asistencia
    WHERE jugador_id = p_jugador
      AND fecha >= date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date
      AND fecha <  (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) + interval '1 month')::date
  ) WHERE id = p_jugador;
$$;


-- ══ 2. Ponerlos todos al día de una ═══════════════════════════════════════
-- Lo que corre el cron. Solo escribe las filas cuyo número cambió, así que
-- pasarlo de más no cuesta nada.
CREATE OR REPLACE FUNCTION public.recalcular_sesiones_todos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inicio date := date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date;
  v_fin    date := (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) + interval '1 month')::date;
  v_afectadas integer;
BEGIN
  WITH conteo AS (
    SELECT j.id, count(a.id)::integer AS n
    FROM jugadores j
    LEFT JOIN asistencia a
      ON a.jugador_id = j.id AND a.fecha >= v_inicio AND a.fecha < v_fin
    GROUP BY j.id
  )
  UPDATE jugadores j
  SET sesiones_usadas = c.n
  FROM conteo c
  WHERE c.id = j.id AND j.sesiones_usadas IS DISTINCT FROM c.n;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  RETURN v_afectadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalcular_sesiones_todos() FROM PUBLIC, anon, authenticated;


-- ══ 3. El único escritor viejo que quedaba ════════════════════════════════
-- `registrar_bloque_asistencia` sumaba de a uno (`sesiones_usadas + 1`) sin
-- mirar la fecha, y además anotaba las ausencias solo en el contador, sin fila
-- en `asistencia`. Está sin uso desde que el cierre por bloque se reemplazó
-- por el registro jugador por jugador (ver src/app/actions/asistencia.ts).
-- Dejarla viva sería dejar un escritor que no respeta el corte mensual.
-- Si alguna vez hace falta, está en la migración 082.
DROP FUNCTION IF EXISTS public.registrar_bloque_asistencia(uuid, date, time, uuid[], uuid[], uuid);
DROP FUNCTION IF EXISTS public.registrar_bloque_asistencia(uuid, date, time, uuid[], uuid[]);


-- ══ 4. Poner al día lo que ya está cargado ════════════════════════════════
SELECT public.recalcular_sesiones_todos();

COMMIT;


-- ══ 5. El cron ════════════════════════════════════════════════════════════
-- Fuera de la transacción: si pg_cron no está habilitado, esto avisa y sigue.
-- Lo de arriba ya quedó aplicado igual, y el contador ya es correcto cada vez
-- que alguien registra asistencia. El cron solo adelanta la puesta al día.
--
-- Corre todos los días, no solo el 1: así no hay que acertarle a la medianoche
-- ni pelear con el horario de verano de Chile (Santiago es UTC-4 en invierno y
-- UTC-3 en verano). 04:05 UTC cae entre las 00:05 y la 01:05 de Santiago.
-- Pasarlo todos los días además corrige cualquier desvío sin intervención.
DO $$
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
  IF NOT FOUND THEN
    RAISE NOTICE 'pg_cron no está habilitado: activalo en Dashboard > Database > Extensions y volvé a correr solo este bloque. Mientras tanto el contador igual queda correcto al registrar asistencia.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('recalcular-sesiones-mensuales');
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- no existía todavía
  END;

  PERFORM cron.schedule(
    'recalcular-sesiones-mensuales',
    '5 4 * * *',
    $cron$SELECT public.recalcular_sesiones_todos()$cron$
  );
  RAISE NOTICE 'Cron programado: recalcular-sesiones-mensuales, todos los días 04:05 UTC.';
END;
$$;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1. Nadie debería pasarse del plan por arrastre de meses viejos.
SELECT nombre, sesiones_usadas, sesiones_limite
FROM jugadores
WHERE estado = 'activo' AND sesiones_limite IS NOT NULL
  AND sesiones_usadas > sesiones_limite
ORDER BY nombre;

-- 2. El cron quedó anotado. Se consulta así y no con `SELECT ... FROM cron.job`
--    porque si pg_cron no está habilitado ese esquema no existe y la consulta
--    corta con error, que se lee como si la migración hubiera fallado.
DO $$
DECLARE v_fila record;
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
  IF NOT FOUND THEN
    RAISE NOTICE 'pg_cron no habilitado — sin cron programado.';
    RETURN;
  END IF;
  FOR v_fila IN EXECUTE
    $q$SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'recalcular-sesiones-mensuales'$q$
  LOOP
    RAISE NOTICE 'cron: % | % | activo=%', v_fila.jobname, v_fila.schedule, v_fila.active;
  END LOOP;
END;
$$;
