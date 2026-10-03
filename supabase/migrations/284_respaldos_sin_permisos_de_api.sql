-- Las tablas de respaldo no se leen por la API, ni siquiera en principio.
--
-- La auditoría del 2026-09-24 las revisó en la base: las 13 `_respaldo_*`
-- tienen RLS activo y ninguna tiene políticas, así que hoy nadie las lee con
-- la llave pública (devuelven cero filas). Pero 10 de ellas conservan el
-- permiso SELECT de `anon` y `authenticated` que Supabase da por defecto, y
-- eso deja la seguridad colgando de una sola capa: el día que alguien le
-- ponga una política a una —para mirarla desde la app, por ejemplo— queda
-- abierta en el acto. Entre ellas hay plata real (`_respaldo_movimientos_089`)
-- y nombres de menores (`_respaldo_asistencia_089`).
--
-- Las otras tres (198, 207, 235) ya hacían este REVOKE; esto las iguala.
-- El respaldo del superadmin (src/lib/respaldo.ts) usa la llave de servicio,
-- que no depende de estos permisos: sigue funcionando igual.
--
-- Recorre por nombre en vez de listar a mano, para cubrir también cualquier
-- respaldo que se haya creado directo en la base y no esté en el repo.

BEGIN;
SELECT _migracion_nueva('284_respaldos_sin_permisos_de_api');
SELECT _migracion_para_todos_los_clubes(
  'quita permisos de API a tablas de respaldo; no escribe ni borra ninguna fila');

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE '\_respaldo\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', t.relname);
  END LOOP;
END;
$$;

COMMIT;


-- ── Verificación (solo lee) ───────────────────────────────────────────────
-- Las 13 filas deben salir con rls = true y anon_puede_leer = false.
SELECT c.relname, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_puede_leer,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_puede_leer
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_respaldo\_%'
ORDER BY c.relname;
