-- Rendimiento de RLS: envolver auth.uid() en (select auth.uid()).
-- Responde al aviso `auth_rls_initplan` de Supabase (~23 políticas en 11 tablas).
--
-- ── Qué problema resuelve ─────────────────────────────────────────────────
-- Cuando una política escribe `auth.uid()` directo, Postgres lo trata como una
-- función volátil y la evalúa UNA VEZ POR FILA. En una consulta que recorre
-- 5.000 asistencias, eso son 5.000 llamadas para obtener siempre el mismo valor.
--
-- Envuelto en `(select auth.uid())` pasa a ser un InitPlan: se evalúa una sola
-- vez al principio y el resultado se reutiliza. Es la recomendación oficial de
-- Supabase y el cambio es semánticamente idéntico —el usuario de la sesión no
-- cambia a mitad de una consulta.
--
-- ── Por qué se hace dinámico y no a mano ──────────────────────────────────
-- Reescribir 23 políticas a mano significa copiar cada expresión USING y
-- WITH CHECK sin equivocarse en un paréntesis. Un error ahí no se ve: la
-- política sigue existiendo pero deja pasar o bloquea lo que no debe. Leer la
-- expresión real desde pg_policy y transformarla con regexp_replace no comete
-- ese error.
--
-- Se usa ALTER POLICY, que cambia la expresión sin borrar la política: en ningún
-- instante la tabla queda sin protección. Un DROP + CREATE sí abriría esa
-- ventana.
--
-- ── Lo que esta migración NO hace ─────────────────────────────────────────
-- No toca el aviso `multiple_permissive_policies` (9 tablas con 4+ políticas).
-- Fusionar políticas cambia QUIÉN puede ver QUÉ, y eso no se automatiza sin
-- leer una por una qué caso de negocio cubre cada una. Es una decisión de
-- permisos, no de rendimiento, y merece su propia revisión.
--
-- ── Reversible ────────────────────────────────────────────────────────────
-- Si algo se comportara raro, el cambio inverso es el mismo regexp al revés.
-- Pero antes de eso: la lógica de cada política queda idéntica, solo cambia
-- cuántas veces se evalúa una función que devuelve siempre lo mismo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('200_rls_rendimiento_auth_uid');

DO $$
DECLARE
  p          record;
  v_qual     text;
  v_check    text;
  v_qual_new text;
  v_check_new text;
  n_cambiadas int := 0;
BEGIN
  FOR p IN
    SELECT pol.polname,
           cls.relname AS tabla,
           pg_get_expr(pol.polqual, pol.polrelid)      AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    v_qual  := p.qual;
    v_check := p.withcheck;

    -- Sólo los auth.uid() que NO vienen ya precedidos por "select ".
    v_qual_new := CASE WHEN v_qual IS NULL THEN NULL ELSE
      regexp_replace(v_qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi') END;
    v_check_new := CASE WHEN v_check IS NULL THEN NULL ELSE
      regexp_replace(v_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi') END;

    IF v_qual_new IS DISTINCT FROM v_qual OR v_check_new IS DISTINCT FROM v_check THEN
      IF v_qual_new IS NOT NULL AND v_check_new IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                       p.polname, p.tabla, v_qual_new, v_check_new);
      ELSIF v_qual_new IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                       p.polname, p.tabla, v_qual_new);
      ELSE
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                       p.polname, p.tabla, v_check_new);
      END IF;

      n_cambiadas := n_cambiadas + 1;
      RAISE NOTICE 'optimizada: %.%', p.tabla, p.polname;
    END IF;
  END LOOP;

  RAISE NOTICE 'Politicas optimizadas: %', n_cambiadas;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Tiene que devolver CERO filas: ya no debe quedar auth.uid() suelto.
SELECT cls.relname AS tabla, pol.polname AS politica
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
  AND (
    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')      ~* '(?<!select )auth\.uid\(\)'
    OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~* '(?<!select )auth\.uid\(\)'
  )
ORDER BY 1, 2;

-- 2) El otro aviso, el que esta migración NO resuelve: tablas con varias
--    políticas permisivas para el mismo rol y acción. Queda a la vista para
--    decidirlo aparte, con criterio de permisos y no de rendimiento.
SELECT cls.relname AS tabla, pol.polcmd AS accion, count(*) AS politicas_permisivas
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public' AND pol.polpermissive
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY 3 DESC, 1;
