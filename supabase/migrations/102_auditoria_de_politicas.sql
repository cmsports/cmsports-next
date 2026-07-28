-- Función de apoyo para auditar las políticas de acceso desde un script.
--
-- No cambia nada del sistema: solo permite leer, con la llave de servicio, qué
-- políticas tiene cada tabla. La usa `scripts/smoke-politicas.mjs`.
--
-- POR QUÉ HACE FALTA. Las políticas de Postgres se suman con OR: una sola
-- permisiva anula a todas las restrictivas de la misma tabla. Así fue como la
-- 095 no cerró nada —había quedado viva una `USING (true)` de la 001— y hubo
-- que escribir la 096 para limpiarlas. Sin poder mirar el estado real, ese
-- error se descubre cuando ya pasó.
--
-- Queda revocada para anon y authenticated: solo la llave de servicio, que
-- vive en el servidor y nunca viaja al navegador.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public._auditoria_politicas()
RETURNS TABLE (tabla text, rls boolean, politica text, comando text, expresion text)
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT c.relname::text, c.relrowsecurity,
         p.polname::text, p.polcmd::text,
         pg_get_expr(p.polqual, p.polrelid)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE c.relkind = 'r'
  ORDER BY c.relname, p.polname;
$$;

REVOKE EXECUTE ON FUNCTION public._auditoria_politicas() FROM PUBLIC, anon, authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Tablas sin RLS y políticas que dejan pasar a cualquiera. Las dos listas
-- deberían venir vacías.
SELECT tabla, rls, politica, comando
FROM public._auditoria_politicas()
WHERE rls = false OR btrim(lower(coalesce(expresion, ''))) = 'true'
ORDER BY tabla;
