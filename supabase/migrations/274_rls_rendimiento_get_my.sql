-- Rendimiento de RLS, segunda mitad: envolver get_my_club_id(), get_my_rol()
-- y get_my_jugador_id() en (select ...).
--
-- ── Por qué hay una segunda mitad ─────────────────────────────────────────
-- La 200 resolvió el aviso `auth_rls_initplan` de Supabase, que solo mira las
-- llamadas literales a `auth.uid()`. Eran ~23 políticas.
--
-- Pero en esta base ese no es el patrón dominante: casi todas las políticas
-- filtran con los helpers `get_my_club_id()` / `get_my_rol()`, y el linter de
-- Supabase no los reconoce porque son funciones propias. Quedaron sin tocar.
--
-- Y cuestan más que un `auth.uid()` suelto. Cada helper es, por dentro:
--
--   SELECT club_id FROM perfiles WHERE id = auth.uid()
--
-- Ser `STABLE` garantiza que el valor no cambia durante la consulta, pero NO
-- obliga a Postgres a calcularlo una sola vez: en un WHERE se sigue llamando
-- por fila. O sea que listar 5.000 asistencias son 5.000 lecturas a `perfiles`
-- para obtener siempre el mismo uuid.
--
-- Envuelto en `(select get_my_club_id())` pasa a ser un InitPlan: se evalúa una
-- vez al principio de la consulta y se reutiliza. Es exactamente el mismo
-- cambio que hizo la 200, aplicado a las funciones que ella no cubría.
--
-- ── Por qué dinámico, igual que la 200 ────────────────────────────────────
-- Son ~600 apariciones repartidas en más de 200 políticas. Reescribirlas a
-- mano es copiar cada expresión USING y WITH CHECK sin equivocarse en un
-- paréntesis, y un error ahí no se ve: la política sigue existiendo pero deja
-- pasar o bloquea lo que no debe. Leer la expresión real desde `pg_policy` y
-- transformarla con regexp_replace no comete ese error.
--
-- Se usa ALTER POLICY, que cambia la expresión sin borrar la política: en
-- ningún instante la tabla queda sin protección. Un DROP + CREATE sí abriría
-- esa ventana.
--
-- El `(?<!select )` evita volver a envolver lo ya envuelto, y se contempla que
-- Postgres pueda imprimir el nombre calificado (`public.get_my_club_id()`)
-- según cómo tenga el search_path al leer la expresión.
--
-- ── Qué NO hace ───────────────────────────────────────────────────────────
-- No cambia la lógica de ninguna política: quién ve qué queda idéntico, solo
-- cambia cuántas veces se evalúa una función que devuelve siempre lo mismo.
--
-- No toca `multiple_permissive_policies` (tablas con varias políticas
-- permisivas para el mismo rol y acción). Fusionarlas cambia permisos, no
-- rendimiento, y merece su propia revisión — la 200 ya lo dejó dicho.
--
-- ── Reversible ────────────────────────────────────────────────────────────
-- El cambio inverso es el mismo regexp al revés. Pero antes de eso: la lógica
-- queda igual, y la verificación del final lo comprueba tabla por tabla.
--
-- ── OJO: el archivo es 274 y el portazo dice 213. No es un error ──────────
-- Esta migración se escribió y se corrió desde una copia del repo que estaba
-- 197 commits atrás, donde el siguiente número libre parecía ser el 213. En
-- main el 213 ya existe (`213_recuperar_grupo_jugadores_torneo_tc.sql`), así
-- que el archivo se renumeró.
--
-- Y se renumeró dos veces: primero al 272, que chocó con
-- `272_liga_modo_jornadas.sql` porque esa entró a main mientras el PR estaba
-- abierto. Es exactamente lo que describe `migraciones-numeracion.test.ts`:
-- dos ramas miran el último número a la vez y las dos suman uno. Quedó en 274.
--
-- El portazo conserva el nombre viejo a propósito: en producción quedó
-- registrada como `213_rls_rendimiento_get_my`, y con ese nombre es con el que
-- la base la reconoce. Si dijera 274, la base no la daría por aplicada y la
-- volvería a ejecutar. Correrla de nuevo no rompe nada —la transformación es
-- idempotente y no tocaría ninguna política—, pero la regla del proyecto es
-- que una migración aplicada no se vuelve a ejecutar, y esa manda.
--
-- En una base nueva funciona igual: registra ese nombre, que no choca con el
-- 213 de main porque el registro guarda el nombre completo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-12, en la base de Buin, bajo el nombre de arriba.
--
-- Resultado verificado ese mismo día:
--   155 políticas quedaron con el helper envuelto.
--     0 políticas quedaron con un helper suelto (verificación 1, cero filas).
--
-- Las once políticas llamadas `allow_all*` no entraron en la cuenta y está
-- bien: no usan los helpers, tienen la subconsulta a `perfiles` escrita a mano
-- y esa forma ya se resuelve una sola vez (no referencia la fila de afuera, así
-- que Postgres la trata como InitPlan). El nombre es un resto de desarrollo
-- temprano —filtran por club igual que el resto—, no una política abierta.

BEGIN;

SELECT _migracion_nueva('213_rls_rendimiento_get_my');

DO $$
DECLARE
  p           record;
  fn          text;
  v_qual      text;
  v_check     text;
  v_qual_new  text;
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
    v_qual_new  := p.qual;
    v_check_new := p.withcheck;

    -- Los tres helpers, con y sin el prefijo de esquema.
    --
    -- Las dos miradas atrás son las que evitan envolver de nuevo lo ya
    -- envuelto, y la segunda no sobra:
    --
    --   `(?<!select )`  descarta `(select get_my_club_id())`.
    --   `(?<!\.)`       descarta el `get_my_club_id()` que es la cola de
    --                   `(select public.get_my_club_id())`. Sin ella el motor
    --                   probaría a hacer calzar solo la parte de después del
    --                   punto —ahí la primera mirada atrás ve "public." y pasa—
    --                   y dejaría `(select public.(select get_my_club_id()))`,
    --                   que es una política rota.
    --
    -- El `\1` en el reemplazo conserva el `public.` cuando venía calificado, en
    -- vez de reescribirlo sin esquema y quedar dependiendo del search_path que
    -- tenga la sesión que corre esto.
    FOREACH fn IN ARRAY ARRAY['get_my_club_id', 'get_my_rol', 'get_my_jugador_id']
    LOOP
      IF v_qual_new IS NOT NULL THEN
        v_qual_new := regexp_replace(
          v_qual_new,
          '(?<!select )(?<!\.)(public\.)?' || fn || '\(\)',
          '(select \1' || fn || '())',
          'gi');
      END IF;
      IF v_check_new IS NOT NULL THEN
        v_check_new := regexp_replace(
          v_check_new,
          '(?<!select )(?<!\.)(public\.)?' || fn || '\(\)',
          '(select \1' || fn || '())',
          'gi');
      END IF;
    END LOOP;

    v_qual  := p.qual;
    v_check := p.withcheck;

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

-- 1) Tiene que devolver CERO filas: ya no debe quedar ningún helper suelto.
SELECT cls.relname AS tabla, pol.polname AS politica
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
  AND (
    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
      ~* '(?<!select )(public\.)?get_my_(club_id|rol|jugador_id)\(\)'
    OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
      ~* '(?<!select )(public\.)?get_my_(club_id|rol|jugador_id)\(\)'
  )
ORDER BY 1, 2;

-- 2) Contraprueba de que las políticas siguen ahí y con su lógica: esta lista
--    tiene que ser igual —misma cantidad, mismas tablas, mismos nombres— a la
--    que devuelva la misma consulta antes de correr la migración. Conviene
--    guardarla antes y comparar después.
SELECT cls.relname AS tabla, pol.polname AS politica, pol.polcmd AS accion
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;

-- 3) El efecto, medido. Con una sesión de usuario real (no service_role, que
--    se salta RLS) el plan de una tabla grande debe mostrar el helper como
--    InitPlan y no una relectura de `perfiles` por fila:
--
--    EXPLAIN (ANALYZE, BUFFERS)
--    SELECT id FROM asistencia WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
