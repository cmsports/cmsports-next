-- Elimina el módulo de Liga Fútbol: sus nueve tablas `lf_*` y la clave
-- 'liga_futbol' de los módulos de cada club.
--
-- PARA TODOS LOS CLUBES: el módulo era código compartido y se borró de la
-- aplicación el 2026-10-26.
--
-- SIN RESPALDO, A PROPÓSITO. Había 281 filas del club "Liga Fut" (liga
-- "Apertura 2026"). El dueño de la plataforma confirmó que las inventó él para
-- probar el módulo y pidió expresamente que no se guarde copia. La primera
-- versión de esta migración las respaldaba y abortaba si había datos; ambas
-- cosas se quitaron por esa decisión. Una vez corrida, las filas no se pueden
-- recuperar.
--
-- ── ORDEN DE DESPLIEGUE ───────────────────────────────────────────────────
-- La aplicación sin el módulo ya está desplegada (commit 1f5abcc). Esta
-- migración se pega después, nunca antes: el calendario de la versión anterior
-- consultaba `lf_fechas`.
--
-- ── Qué NO toca ───────────────────────────────────────────────────────────
-- · `movimientos` ni ninguna plata: las inscripciones de equipos se cobraban
--   por el RPC de Finanzas y quedaron ahí.
-- · La fila del club "Liga Fut" en `clubes`, ni sus cuentas de acceso: borrar
--   un club se hace desde el panel del superadmin, que también quita sus
--   cuentas. Borrar la fila a mano dejaría esas cuentas huérfanas.
-- · Las migraciones 221 a 224, 241 y 285: se quedan como historia.
--
-- ── Qué hace ──────────────────────────────────────────────────────────────
-- 1. Cuenta las filas de cada tabla lf_* y las deja en los mensajes.
-- 2. Quita 'liga_futbol' de clubes.modulos_habilitados.
-- 3. DROP de las nueve tablas, juntas y SIN CASCADE: si algo que no sea de
--    este módulo depende de ellas, la migración se cae en vez de llevárselo.
--    Sus políticas, índices y su membresía en `supabase_realtime` se van con
--    ellas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Fecha de ejecución: (anotar al correrla)

BEGIN;
SELECT _migracion_nueva('305_eliminar_liga_futbol');
SELECT _migracion_para_todos_los_clubes(
  'borra tablas lf_* de un módulo retirado; no toca movimientos ni jugadores');

-- ── 1. Cuántas filas se van ───────────────────────────────────────────────
DO $$
DECLARE
  v_tabla  text;
  v_filas  bigint;
  v_total  bigint := 0;
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
  RAISE NOTICE 'Total que se borra: % filas', v_total;
END;
$$;

-- ── 2. La clave del módulo sale de la lista de cada club ──────────────────
UPDATE public.clubes
SET modulos_habilitados = array_remove(modulos_habilitados, 'liga_futbol')
WHERE 'liga_futbol' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[]));

-- ── 3. Las tablas ─────────────────────────────────────────────────────────
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
