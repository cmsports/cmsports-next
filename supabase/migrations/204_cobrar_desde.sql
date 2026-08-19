-- `jugadores.cobrar_desde`: a partir de qué mes se le cobra a cada jugador.
--
-- ── El problema ───────────────────────────────────────────────────────────
-- Hoy el sistema no tiene forma de saber desde cuándo le corresponde pagar a
-- alguien. La emisión mensual le crea cuota a TODO activo no externo, y la
-- pantalla mostraba "pendiente" a quien no tuviera fila. Resultado: a un
-- jugador que entró en agosto se le veía deuda de julio.
--
-- `creado_en` no sirve como reemplazo, y esto es importante:
--
--   · Para 120 jugadores vale 2026-07-21, que es cuando se MIGRÓ el club al
--     sistema, no cuando entró cada uno.
--   · Y desde el commit "reutilizar ficha de visita al aceptar el alta", una
--     visita que se hace socia CONSERVA su ficha para no perder ranking ni
--     pagos. Esa ficha puede tener meses de antigüedad. Con `creado_en` como
--     referencia, quien jugó un torneo en junio y se hizo socio en septiembre
--     arrastraría cuotas desde junio.
--
-- Por eso el dato se fija explícitamente al aceptar la solicitud, y no se
-- deduce de ninguna fecha existente.
--
-- ── El backfill ───────────────────────────────────────────────────────────
-- Para los que ya están: el mes de su PRIMERA cuota existente. Si sus cuotas
-- de julio están pagadas, julio efectivamente les correspondía. Al que no
-- tiene ninguna cuota se le usa el mes de creación de su ficha, que es lo
-- único disponible.
--
-- Reparto esperado (medido antes de escribir esto, sobre los 198 jugadores de
-- todos los clubes): 11 en abril, 30 en mayo, 2 en junio, 120 en julio y 35 en
-- agosto.
--
-- ── NULL sigue significando "sin restricción" ─────────────────────────────
-- La columna queda opcional a propósito. Una fila sin el dato se comporta como
-- hasta ahora, así que nada existente se rompe si algún camino crea un jugador
-- sin pasar por la solicitud.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('204_cobrar_desde');

-- ── 1. La columna ────────────────────────────────────────────────────────
-- Es un date pero solo importa el año y el mes; se guarda el día 1 por
-- convención para que ordene y se compare sin ambigüedad.
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS cobrar_desde date;

COMMENT ON COLUMN public.jugadores.cobrar_desde IS
  'Primer mes que se le cobra (día 1 del mes). NULL = sin restricción. Se fija al aceptar la solicitud.';

-- ── 2. Backfill ──────────────────────────────────────────────────────────
WITH primera_cuota AS (
  SELECT jugador_id, make_date(min(anio * 100 + mes) / 100, min(anio * 100 + mes) % 100, 1) AS desde
  FROM public.mensualidades
  WHERE jugador_id IS NOT NULL
  GROUP BY jugador_id
)
UPDATE public.jugadores j
   SET cobrar_desde = COALESCE(
         pc.desde,
         date_trunc('month', (j.creado_en AT TIME ZONE 'America/Santiago'))::date
       )
  FROM (SELECT id FROM public.jugadores) todos
  LEFT JOIN primera_cuota pc ON pc.jugador_id = todos.id
 WHERE j.id = todos.id
   AND j.cobrar_desde IS NULL;

-- ── 3. La emisión automática del día 1 lo respeta ────────────────────────
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
  SELECT j.club_id, j.id, v_mes, v_anio, 'pendiente', j.mensualidad
  FROM public.jugadores j
  WHERE j.club_id IS NOT NULL
    AND (p_club_id IS NULL OR j.club_id = p_club_id)
    AND j.estado = 'activo'
    AND (j.es_externo IS NULL OR j.es_externo = false)
    -- No se le cobra un mes anterior a su primera cuota. NULL = sin restricción.
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

-- ── 4. Y la generación manual del admin también ──────────────────────────
-- Si no, el admin podría crear a mano justo la cuota que el cron evita, y la
-- pantalla la genera sola al abrir el mes.
CREATE OR REPLACE FUNCTION public.generar_mensualidades_jugadores_seguro(
  p_jugador_ids uuid[],
  p_mes integer,
  p_anio integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id     uuid;
  v_user_id     uuid;
  v_admin_nombre text;
  v_insertadas  integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Mes o año inválido';
  END IF;

  IF p_jugador_ids IS NULL OR cardinality(p_jugador_ids) > 1000 OR array_position(p_jugador_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Lista de jugadores inválida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_jugador_ids) AS input(jugador_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = input.jugador_id AND j.club_id = v_club_id)
  ) THEN RAISE EXCEPTION 'Uno o más jugadores no pertenecen al club'; END IF;

  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT DISTINCT v_club_id, j.id, p_mes, p_anio, 'pendiente', j.mensualidad
  FROM public.jugadores j
  JOIN unnest(p_jugador_ids) AS input(jugador_id) ON input.jugador_id = j.id
  WHERE j.club_id = v_club_id
    AND (j.cobrar_desde IS NULL
         OR make_date(p_anio, p_mes, 1) >= date_trunc('month', j.cobrar_desde)::date)
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generar_mensualidades_jugadores_seguro(uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_mensualidades_jugadores_seguro(uuid[], integer, integer) TO authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Nadie debería quedar sin el dato.
SELECT count(*) AS jugadores_sin_cobrar_desde
FROM public.jugadores WHERE cobrar_desde IS NULL;

-- 2) El reparto, para contrastar con lo esperado.
SELECT to_char(cobrar_desde, 'YYYY-MM') AS desde, count(*) AS jugadores
FROM public.jugadores
GROUP BY 1 ORDER BY 1;

-- 3) Lo que esta migración viene a impedir: cuotas de meses anteriores al
--    primer mes cobrable. Las que ya existen se dejan como están —son
--    historia, y varias están pagadas— pero no deberían aparecer nuevas.
SELECT j.nombre, m.mes, m.anio, m.estado, m.monto,
       to_char(j.cobrar_desde, 'YYYY-MM') AS cobrar_desde
FROM public.mensualidades m
JOIN public.jugadores j ON j.id = m.jugador_id
WHERE j.cobrar_desde IS NOT NULL
  AND make_date(m.anio, m.mes, 1) < date_trunc('month', j.cobrar_desde)::date
ORDER BY j.nombre;
