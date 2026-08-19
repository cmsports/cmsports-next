-- Supabase avisó por correo (17-08-2026) con la alerta `rls_disabled_in_public`:
-- hay tablas en el esquema público sin Row Level Security.
--
-- Son las tablas de respaldo. Se crearon con `CREATE TABLE ... AS SELECT` en las
-- migraciones que salvaron datos antes de una operación destructiva, y ese
-- `CREATE TABLE AS` no activa RLS ni lo hereda de la tabla de origen. A nadie se
-- le pasó activarlo después.
--
-- ── Qué tan grave es hoy ──────────────────────────────────────────────────
-- Se comprobó con la llave anónima contra las 94 tablas que expone la API: las
-- de respaldo devuelven CERO filas, aunque por dentro tengan datos
-- (_respaldo_mensualidades_089 tiene 104 filas y _respaldo_movimientos_089
-- tiene 45). O sea que hoy NO hay fuga: lo que las protege son los permisos de
-- PostgREST, que no le dan SELECT al rol anónimo.
--
-- Pero eso es una sola línea de distancia del desastre. Con RLS apagado, el día
-- que alguien corra un `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`
-- —cosa que se hace sin pensar— esas tablas quedan abiertas de par en par. Y no
-- son cualquier tabla: son las que guardan los 161 movimientos de mensualidad y
-- el ingreso de $3.191.300 que se recuperaron cuando la 089 se ejecutó dos
-- veces. Es plata real de gente real.
--
-- Por eso Supabase las marca como críticas aunque no estén filtrando: RLS es la
-- defensa que no depende de que nadie se equivoque con un GRANT.
--
-- ── Por qué activar RLS sin política ──────────────────────────────────────
-- Una tabla con RLS activo y sin política deniega todo. Es exactamente lo que
-- queremos: estos respaldos no los tiene que leer nadie por la API.
--
-- La función de respaldo del superadmin (src/lib/respaldo.ts) las sigue leyendo
-- sin problema, porque usa el cliente admin con la service_role key, y ese rol
-- se salta RLS por definición.
--
-- ── Lo que esta migración NO hace ─────────────────────────────────────────
-- No borra ninguna tabla de respaldo. Son la evidencia de la recuperación de
-- julio y el motivo por el que hoy existe la regla del portazo. Se quedan.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('197_rls_en_tablas_de_respaldo');

-- Se recorren por patrón y no por nombre fijo: si mañana una migración crea
-- otro respaldo, esta misma lógica lo cubre al re-ejecutarse en otra base.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE '\_respaldo\_%'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    -- Sin política: deniega a todo el mundo salvo service_role.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);
    RAISE NOTICE 'RLS activado y permisos revocados en %', t.relname;
  END LOOP;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Ninguna tabla de respaldo debería quedar con RLS apagado.
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_respaldo\_%'
ORDER BY c.relname;

-- 2) Y esta es la consulta que responde la alerta completa de Supabase: CUALQUIER
--    tabla del esquema público sin RLS. Si devuelve filas, hay que revisarlas una
--    por una y decidir: la mayoría debería tener RLS, pero alguna puede ser
--    pública a propósito.
SELECT c.relname AS tabla_sin_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
ORDER BY c.relname;
