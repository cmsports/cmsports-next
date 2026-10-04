-- La emisión automática de mensualidades pasa a ser una opción de cada club.
--
-- Hasta hoy el cron de la 107 llamaba a `emitir_mensualidades_mes_actual` con
-- el UUID de Buin escrito a mano: Buin recibía sus cuotas solo cada noche y
-- ningún otro club, sin forma de pedirlo salvo editar el cron. Ahora lo decide
-- la clave `mensualidad.emision_automatica` de `club_config`, que el admin
-- cambia desde Configuración:
--
--   'auto' (default, ningún club tiene la fila) → exactamente lo de antes:
--          Buin sí, los demás no. Por eso esto no le cambia nada a nadie.
--   'si'   → el club recibe sus cuotas cada noche.
--   'no'   → no las recibe; se emiten a mano como siempre.
--
-- Y una segunda cosa que hacía falta para que 'si' sea seguro en otro club:
-- `emitir_mensualidades_mes_actual` usaba siempre `jugadores.mensualidad`, sin
-- mirar `mensualidad.modo`. La generación manual ya respetaba los planes desde
-- la 252; la automática no, y un club por plan que la encendiera recibía
-- cuotas con el monto equivocado —o sin monto—. Ahora usa el mismo `CASE` que
-- `generar_mensualidades`. En un club 'monto_libre' (Buin) el resultado es
-- idéntico al de la 204: el `CASE` cae en `j.mensualidad`.
--
-- No escribe ninguna fila: redefine funciones y reprograma el cron.
--
-- ══ Se pega DESPUÉS de la 294 (ajustada el 2026-10-04) ═══════════════════
-- Esta migración se escribió el 2026-09-24 y no se pegó. Entretanto la
-- `294_retencion_automatica_spinhouse` dejó en producción esta misma versión
-- de `emitir_mensualidades_mes_actual` más un filtro: no emitir cuota a quien
-- la retención automática marcó inactivo (`_jugador_inactivo_retencion`, que
-- solo responde "sí" en clubes con el módulo `retencion_automatica`). La
-- versión original de la 286 no lo tenía y, pegada después, lo borraba. Ahora
-- lo trae, así que la sección 1 deja la función exactamente como ya está; lo
-- nuevo de verdad son las secciones 2 a 4.
--
-- ══ ANTES de pegarla (solo lectura) ═════════════════════════════════════
--   -- Debe dar 0 filas:
--   SELECT nombre FROM _migraciones_aplicadas WHERE nombre LIKE '286%';
--   -- Debe dar 1 fila (sin la 294 esta migración se detiene sola):
--   SELECT nombre FROM _migraciones_aplicadas WHERE nombre LIKE '294%';

BEGIN;
SELECT _migracion_nueva('286_emision_automatica_por_club');
SELECT _migracion_para_todos_los_clubes(
  'redefine la emisión automática y su cron para todos los clubes; con la clave en su default el resultado es el mismo de antes y no escribe filas');

-- Sin la 294 no existe `_jugador_inactivo_retencion` y la emisión fallaría
-- recién a medianoche, en el cron, sin que nadie lo vea. Mejor fallar acá.
DO $$
BEGIN
  IF to_regprocedure('public._jugador_inactivo_retencion(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta la 294_retencion_automatica_spinhouse: pégala antes que esta.';
  END IF;
END $$;

-- ── 1. La emisión respeta el plan de cada jugador ────────────────────────
-- Misma firma, mismos filtros y mismo ON CONFLICT que la 204. Lo nuevo es el
-- monto, que sale como en `generar_mensualidades` (252), y el filtro de la 294.
CREATE OR REPLACE FUNCTION public.emitir_mensualidades_mes_actual(p_club_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy  date    := (now() AT TIME ZONE 'America/Santiago')::date;
  v_mes  integer := extract(month from v_hoy)::integer;
  v_anio integer := extract(year  from v_hoy)::integer;
  v_insertadas integer;
BEGIN
  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT j.club_id, j.id, v_mes, v_anio, 'pendiente',
    CASE
      WHEN public._config_texto(j.club_id, 'mensualidad.modo', 'monto_libre') = 'por_plan'
        THEN coalesce(pl.monto, j.mensualidad)
      ELSE j.mensualidad
    END
  FROM public.jugadores j
  LEFT JOIN public.planes_club pl
    ON pl.id = j.plan_id AND pl.club_id = j.club_id
  WHERE j.club_id IS NOT NULL
    AND (p_club_id IS NULL OR j.club_id = p_club_id)
    AND j.estado = 'activo' AND NOT public._jugador_inactivo_retencion(j.club_id,j.id)
    AND (j.es_externo IS NULL OR j.es_externo = false)
    AND (j.cobrar_desde IS NULL
         OR make_date(v_anio, v_mes, 1) >= date_trunc('month', j.cobrar_desde)::date)
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emitir_mensualidades_mes_actual(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Qué clubes reciben cuotas solas ───────────────────────────────────
-- 'auto' se resuelve al comportamiento previo: el club que el cron de la 107
-- tenía escrito. El UUID vive acá, en un solo lugar, en vez de en la llamada
-- del cron; cuando Buin quiera fijarlo, basta con poner 'si' en su fila.
CREATE OR REPLACE FUNCTION public._emite_mensualidades_solo(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  SELECT CASE public._config_texto(p_club_id, 'mensualidad.emision_automatica', 'auto')
    WHEN 'si' THEN true
    WHEN 'no' THEN false
    ELSE p_club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid
  END;
$$;
REVOKE ALL ON FUNCTION public._emite_mensualidades_solo(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Lo que llama el cron ──────────────────────────────────────────────
-- Un club a la vez: si uno falla, los demás igual reciben sus cuotas, y el
-- resultado dice cuántas se emitieron en cada uno.
CREATE OR REPLACE FUNCTION public.emitir_mensualidades_automaticas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v_n integer;
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  FOR c IN SELECT id, nombre FROM public.clubes ORDER BY nombre LOOP
    IF public._emite_mensualidades_solo(c.id) THEN
      BEGIN
        v_n := public.emitir_mensualidades_mes_actual(c.id);
        v_resultado := v_resultado || jsonb_build_object(c.nombre, v_n);
      EXCEPTION WHEN OTHERS THEN
        v_resultado := v_resultado || jsonb_build_object(c.nombre, 'error: ' || SQLERRM);
      END;
    END IF;
  END LOOP;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.emitir_mensualidades_automaticas() FROM PUBLIC, anon, authenticated;

-- ── 4. El cron llama a la nueva ──────────────────────────────────────────
-- Mismo nombre y misma hora que la 107 (04:00 UTC, 00:00/01:00 de Chile).
DO $$
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
  IF NOT FOUND THEN
    RAISE NOTICE 'pg_cron no está habilitado: las funciones quedaron creadas, pero no hay cron que reprogramar.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('emitir-mensualidades-mes');
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- no existía
  END;

  PERFORM cron.schedule(
    'emitir-mensualidades-mes',
    '0 4 * * *',
    $cron$SELECT public.emitir_mensualidades_automaticas()$cron$
  );
END;
$$;

COMMIT;


-- ── Verificación (solo lee) ───────────────────────────────────────────────
-- 1) Qué clubes reciben cuotas solas. Hoy debe salir true SOLO Buin.
SELECT nombre, public._emite_mensualidades_solo(id) AS recibe_cuotas_solas
FROM clubes ORDER BY nombre;

-- 2) El cron apunta a la función nueva.
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'emitir-mensualidades-mes';
