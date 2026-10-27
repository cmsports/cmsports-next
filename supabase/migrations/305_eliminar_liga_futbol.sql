-- Elimina el módulo de Liga Fútbol: sus nueve tablas `lf_*` y la clave
-- 'liga_futbol' de los módulos de cada club.
--
-- PARA TODOS LOS CLUBES: el módulo era código compartido y se borró de la
-- aplicación el 2026-10-26. Ningún club lo usa, que se sepa, y por eso esta
-- migración NO da eso por cierto: si cualquiera de las nueve tablas tiene una
-- sola fila, se cae antes de tocar nada y dice cuántas hay y de qué club.
-- Si alguna vez hace falta borrarlas con datos, se decide a propósito (se
-- quita la guarda de abajo y queda el respaldo), no se descubre después.
--
-- ── ORDEN DE DESPLIEGUE (importa) ─────────────────────────────────────────
-- 1. Primero se sube la aplicación SIN el módulo.
-- 2. Recién después se pega esta migración.
-- Al revés, el calendario de la versión anterior consulta `lf_fechas` y, con
-- la tabla borrada, muestra error de carga a todos los clubes.
--
-- ── Qué NO toca ───────────────────────────────────────────────────────────
-- Ni `movimientos` ni ninguna plata: las inscripciones de equipos se cobraban
-- por el RPC de Finanzas y quedaron ahí; la plata de un mes cerrado no cambia.
-- Las migraciones 221 a 224, 241 y 285 se quedan como historia.
--
-- ── Qué hace ──────────────────────────────────────────────────────────────
-- 1. Guarda: aborta si hay datos en alguna tabla lf_*.
-- 2. Respalda las nueve tablas (nombre único por corrida, sin IF NOT EXISTS,
--    sin permisos de API: ver docs/migraciones-destructivas.md).
-- 3. Quita 'liga_futbol' de clubes.modulos_habilitados.
-- 4. DROP de las nueve tablas, juntas y SIN CASCADE: si algo que no sea de este
--    módulo depende de ellas, la migración se cae en vez de llevárselo.
--    Sus políticas, índices y su membresía en `supabase_realtime` se van con
--    ellas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Fecha de ejecución: (anotar al correrla)

BEGIN;
SELECT _migracion_nueva('305_eliminar_liga_futbol');
SELECT _migracion_para_todos_los_clubes(
  'borra tablas lf_* de un módulo retirado; no toca movimientos ni jugadores');

-- ── 1. Guarda: sin datos, o no se sigue ───────────────────────────────────
DO $$
DECLARE
  v_tabla  text;
  v_filas  bigint;
  v_total  bigint := 0;
  v_ligas  text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'lf_ligas', 'lf_grupos', 'lf_equipos', 'lf_jugadores', 'lf_fechas',
    'lf_partidos', 'lf_goles', 'lf_tarjetas', 'lf_sanciones'
  ]
  LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      CONTINUE;  -- ya no existe: nada que contar
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', v_tabla) INTO v_filas;
    RAISE NOTICE '% -> % filas', v_tabla, v_filas;
    v_total := v_total + v_filas;
  END LOOP;

  IF v_total > 0 THEN
    SELECT string_agg(c.nombre || ' (' || x.n || ' ligas)', ', ')
      INTO v_ligas
    FROM (SELECT club_id, count(*) AS n FROM public.lf_ligas GROUP BY club_id) x
    JOIN public.clubes c ON c.id = x.club_id;
    RAISE EXCEPTION
      'Hay % filas en las tablas lf_* (ligas por club: %). No se borra nada: confirma con el club que esos datos son descartables antes de seguir.',
      v_total, COALESCE(v_ligas, 'ninguna liga, solo filas sueltas');
  END IF;
END;
$$;

-- ── 2. Respaldo (nombre único por corrida) ────────────────────────────────
-- Sin IF NOT EXISTS: si ya existe, la migración se cae antes de borrar nada.
-- Con la guarda de arriba estas copias salen vacías, pero dejan la estructura
-- por si hay que reconstruir el módulo.
DO $$
BEGIN
  IF to_regclass('public.lf_ligas') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'CREATE TABLE public._respaldo_lf_ligas_305_20261026 AS SELECT * FROM public.lf_ligas';
  EXECUTE 'CREATE TABLE public._respaldo_lf_grupos_305_20261026 AS SELECT * FROM public.lf_grupos';
  EXECUTE 'CREATE TABLE public._respaldo_lf_equipos_305_20261026 AS SELECT * FROM public.lf_equipos';
  EXECUTE 'CREATE TABLE public._respaldo_lf_jugadores_305_20261026 AS SELECT * FROM public.lf_jugadores';
  EXECUTE 'CREATE TABLE public._respaldo_lf_fechas_305_20261026 AS SELECT * FROM public.lf_fechas';
  EXECUTE 'CREATE TABLE public._respaldo_lf_partidos_305_20261026 AS SELECT * FROM public.lf_partidos';
  EXECUTE 'CREATE TABLE public._respaldo_lf_goles_305_20261026 AS SELECT * FROM public.lf_goles';
  EXECUTE 'CREATE TABLE public._respaldo_lf_tarjetas_305_20261026 AS SELECT * FROM public.lf_tarjetas';
  EXECUTE 'CREATE TABLE public._respaldo_lf_sanciones_305_20261026 AS SELECT * FROM public.lf_sanciones';
END;
$$;

-- Los respaldos no se leen por la API (mismo criterio que la 284).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE '\_respaldo\_lf\_%\_305\_20261026'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', t.relname);
  END LOOP;
END;
$$;

-- ── 3. La clave del módulo sale de la lista de cada club ──────────────────
UPDATE public.clubes
SET modulos_habilitados = array_remove(modulos_habilitados, 'liga_futbol')
WHERE 'liga_futbol' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[]));

-- ── 4. Las tablas ─────────────────────────────────────────────────────────
-- Juntas y sin CASCADE: las llaves foráneas entre ellas se resuelven, y
-- cualquier dependencia de afuera hace fallar la migración entera.
DROP TABLE IF EXISTS
  public.lf_sanciones, public.lf_tarjetas, public.lf_goles, public.lf_partidos,
  public.lf_fechas, public.lf_jugadores, public.lf_equipos, public.lf_grupos,
  public.lf_ligas;

COMMIT;


-- ── Verificación (solo lee) ───────────────────────────────────────────────
-- 1. No debe quedar ninguna tabla lf_* ni ninguna en la publicación realtime:
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'lf\_%';
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename LIKE 'lf\_%';
-- 2. Ningún club debe conservar la clave:
SELECT nombre FROM clubes WHERE 'liga_futbol' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[]));
-- 3. Los nueve respaldos existen y nadie de la API los lee:
SELECT c.relname, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_puede_leer
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_respaldo\_lf\_%'
ORDER BY c.relname;
