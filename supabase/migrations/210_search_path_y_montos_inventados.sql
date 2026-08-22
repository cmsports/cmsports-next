-- ────────────────────────────────────────────────────────────
-- Dos arreglos que salieron de la auditoría del 2026-08-22.
--
-- ── 1. Cuatro funciones SECURITY DEFINER sin search_path fijo ─────────────
--
-- La 041 le puso `SET search_path = public, pg_temp` a las funciones
-- privilegiadas de entonces. Pero `CREATE OR REPLACE FUNCTION` **borra** los
-- SET que tenía la función anterior, y estas cuatro se redefinieron después
-- de la 041 sin volver a ponerlo:
--
--   corregir_mensualidad         (116)  ← toca plata
--   registrar_asistencia_segura  (105)
--   registrar_asistencia_manual  (092)
--   limpiar_jugadores_externos   (061)
--
-- (`registrar_bloque_asistencia` también aparecía en la lista de la auditoría,
--  pero no existe: la borró la migración 106 y nadie la recreó.)
--
-- Una función SECURITY DEFINER corre con los permisos de su dueño. Si el
-- search_path no está fijo, quien la llama puede anteponer un esquema propio
-- y hacer que `insert into asistencia` apunte a otra tabla. Es la regla que
-- el propio linter de Supabase marca como `function_search_path_mutable`.
--
-- Se arregla con ALTER FUNCTION, que cambia solo esa propiedad y no toca el
-- cuerpo: no hay riesgo de reintroducir una versión vieja por copiar mal.
--
-- ── 2. generar_mensualidades sigue inventando montos ──────────────────────
--
-- La 097 ("sin_montos_genericos") sacó la tabla de montos adivinados porque
-- «un monto inventado se ve igual de real que uno correcto: nadie lo revisa y
-- termina cobrado». Pero arregló solo `generar_mensualidades_jugadores_seguro`.
--
-- La otra función que emite cuotas, `generar_mensualidades`, quedó con la
-- tabla intacta desde la 134:
--
--   coalesce(j.mensualidad, case j.sesiones_limite
--     when 4 then 15000 when 8 then 25000
--     when 12 then 30000 when 16 then 40000 else 25000 end)
--
-- Hoy la aplicación no la llama —usa la `_seguro`—, pero existe, es
-- SECURITY DEFINER y cualquier admin puede invocarla por la API REST. Se
-- alinea con la 097: sin cuota asignada, la mensualidad se emite sin monto y
-- la pantalla muestra "Cuota por asignar". No se elimina la función porque
-- borrar algo que quizá alguien llame es peor que dejarlo correcto.
--
-- No destructivo: no se toca ninguna fila, solo definiciones y propiedades.
-- Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('210_search_path_y_montos_inventados');

-- ══ 1. search_path fijo en las que quedaron sin él ═══════════════════════
-- Se recorren por NOMBRE, no por firma. Escribir los argumentos a mano es
-- frágil: la primera versión de esta migración nombraba
-- registrar_bloque_asistencia(uuid, date, time, uuid[], uuid[], uuid) y la
-- transacción entera abortó con "la función no existe", porque la migración
-- 106 la había borrado. Buscar por nombre encuentra la firma que realmente
-- esté viva, y si la función no está, simplemente no entra al bucle.
--
-- pg_temp va al final a propósito: si no se nombra, PostgreSQL lo busca igual
-- y antes que public, que es justo el hueco que se quiere cerrar.
DO $BLOQUE$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef
      AND p.proname IN (
        'corregir_mensualidad',
        'registrar_asistencia_segura',
        'registrar_asistencia_manual',
        'limpiar_jugadores_externos'
      )
      AND (p.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.firma);
    RAISE NOTICE 'search_path fijado en %', f.firma;
  END LOOP;
END $BLOQUE$;


-- ══ 2. generar_mensualidades deja de adivinar el monto ════════════════════
CREATE OR REPLACE FUNCTION generar_mensualidades(p_club_id uuid, p_mes integer, p_anio integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_insertados int := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  insert into mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  select
    p_club_id,
    j.id,
    p_mes,
    p_anio,
    'pendiente',
    -- Sin tabla de montos por plan: el profe define cada cuota a mano —hay de
    -- $7.000, de $21.000, de $50.000— y ninguna tabla puede adivinarlas. Si el
    -- jugador no tiene cuota asignada, la mensualidad nace sin monto. Ver 097.
    j.mensualidad
  from jugadores j
  where j.club_id = p_club_id
    and j.estado = 'activo'
    and (j.es_externo is null or j.es_externo = false)
    and not exists (
      select 1 from mensualidades m
      where m.jugador_id = j.id
        and m.club_id = p_club_id
        and m.mes = p_mes
        and m.anio = p_anio
    );

  get diagnostics v_insertados = row_count;

  return json_build_object(
    'club_id', p_club_id,
    'mes', p_mes,
    'anio', p_anio,
    'mensualidades_creadas', v_insertados
  );
end;
$$;

-- El DROP de la 134 se llevó los REVOKE de la 018 y la 041: al soltar una
-- función se pierde su ACL y la nueva nace con EXECUTE para PUBLIC. El cuerpo
-- ya corta a los anónimos con `auth.uid() is null`, así que no era una fuga,
-- pero la puerta se vuelve a cerrar donde corresponde.
REVOKE ALL ON FUNCTION public.generar_mensualidades(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_mensualidades(uuid, integer, integer) TO authenticated;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Ninguna SECURITY DEFINER debe quedar sin search_path: cero filas.
SELECT p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.prosecdef
  AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
ORDER BY p.proname;

-- 2) Y generar_mensualidades ya no debe traer los montos inventados: false.
SELECT pg_get_functiondef(p.oid) LIKE '%15000%' AS aun_inventa_montos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'generar_mensualidades';
