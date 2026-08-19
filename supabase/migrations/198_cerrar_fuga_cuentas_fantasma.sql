-- FUGA ACTIVA, no un riesgo latente. Se confirmó a las 2026-08-18 con la llave
-- pública (anon), sin sesión: `_respaldo_cuentas_fantasma_20260809` devolvía sus
-- 8 filas —id, nombre, EMAIL, rol, jugador_id, club_id, email_auth, creada_en—
-- a cualquiera que le pidiera la URL del proyecto.
--
-- Es la tabla que dejó la migración 141 al limpiar cuentas fantasma. La 197
-- (de ayer) sólo tocaba tablas con RLS APAGADO; esta ya tenía RLS prendido, así
-- que su condición `relrowsecurity = false` la saltó sin arreglarla. Sea por
-- una política vieja demasiado permisiva o por un GRANT a `anon` que quedó de
-- alguna prueba, el resultado medido es el que importa: se leía sin sesión.
--
-- Por eso acá no se repite el patrón "solo si RLS está apagado": se fuerza el
-- estado correcto sin condición, se botan las políticas que hubiera (ninguna
-- se necesita: es un respaldo, solo lo lee el superadmin con la service key,
-- que se salta RLS igual) y se revocan los permisos explícitos.
--
-- EJECUCIÓN MANUAL, YA: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('198_cerrar_fuga_cuentas_fantasma');

DO $$
DECLARE pol record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_respaldo_cuentas_fantasma_20260809'
  ) THEN
    -- Bota cualquier política existente, sea cual sea su nombre.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = '_respaldo_cuentas_fantasma_20260809'
    LOOP
      EXECUTE format('DROP POLICY %I ON public._respaldo_cuentas_fantasma_20260809', pol.policyname);
    END LOOP;

    EXECUTE 'ALTER TABLE public._respaldo_cuentas_fantasma_20260809 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._respaldo_cuentas_fantasma_20260809 FROM anon, authenticated, PUBLIC';
  ELSE
    RAISE NOTICE 'La tabla no existe en esta base: nada que cerrar.';
  END IF;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) RLS tiene que estar activo y sin políticas.
SELECT c.relrowsecurity AS rls_activo,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_respaldo_cuentas_fantasma_20260809';

-- 2) Barrido completo: cualquier tabla en `public` con una política que le dé
--    acceso a `anon` o `public`, para no volver a descubrir esto por un correo.
SELECT schemaname, tablename, policyname, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
ORDER BY tablename;
