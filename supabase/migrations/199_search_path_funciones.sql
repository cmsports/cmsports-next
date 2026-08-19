-- Supabase reporta ~19 avisos `function_search_path_mutable`. Cinco son un
-- riesgo de seguridad real y el resto es higiene.
--
-- ── Por qué importa ───────────────────────────────────────────────────────
-- Una función SECURITY DEFINER corre con los privilegios de quien la creó
-- (postgres), pero resuelve los nombres de tabla sin calificar usando el
-- `search_path` de QUIEN LA LLAMA. Ejemplo real de este repo, en
-- `registrar_asistencia_segura`:
--
--     SELECT club_id, rol INTO v_club_staff, v_rol FROM perfiles WHERE id = auth.uid();
--
-- `perfiles` va sin esquema. Si alguien logra anteponer un esquema propio a su
-- search_path y crear ahí una tabla `perfiles`, la función —corriendo como
-- superusuario— leería la tabla del atacante en vez de la real. El guardia de
-- rol que la 105 agregó con tanto cuidado se saltaría solo.
--
-- Las cinco SECURITY DEFINER afectadas, y lo que protegen:
--   · registrar_asistencia_segura   — guardia de rol para pasar lista
--   · registrar_asistencia_manual   — idem
--   · registrar_bloque_asistencia   — idem, por bloque
--   · corregir_mensualidad          — CORRIGE PLATA y genera el movimiento de ajuste
--   · limpiar_jugadores_externos    — borra fichas
--
-- ── Por qué se hace dinámico ──────────────────────────────────────────────
-- Escribir 19 `ALTER FUNCTION` a mano exige tipear cada firma exacta (una coma
-- de más y falla, o peor: altera una sobrecarga distinta a la que se quería).
-- Recorrer pg_proc no se equivoca, y de paso cubre cualquier función que se
-- haya creado desde el panel y no esté en ninguna migración.
--
-- ── Por qué se saltan las funciones de extensiones ────────────────────────
-- El primer intento de esta migración abortó con:
--
--     ERROR 42501: debe ser el propietario de la función public.unaccent
--
-- `unaccent` no es del proyecto: la instaló la extensión del mismo nombre y su
-- dueño es el superusuario de Postgres. Nadie puede alterarla desde el SQL
-- Editor, y tampoco hace falta —su search_path lo maneja la extensión—. Se
-- excluyen por `pg_depend` con deptype='e', que es la marca de "esto pertenece
-- a una extensión".
--
-- (De paso, esa extensión en el esquema público es el aviso `extension_in_public`
-- que también aparece en la lista de Supabase. Moverla es otro tema y no se
-- toca acá: moverla puede romper índices y funciones que la usan.)
--
-- Esto NO cambia la lógica de ninguna función: sólo fija en qué esquemas busca
-- los nombres. `public, pg_temp` es el mismo valor que ya usan las funciones de
-- finanzas desde la 039.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('199_search_path_funciones');

DO $$
DECLARE
  f record;
  n_definer int := 0;
  n_normal  int := 0;
  n_saltada int := 0;
BEGIN
  FOR f IN
    SELECT p.oid,
           p.proname,
           p.prosecdef,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- Sin search_path fijo todavía
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
      -- Que no pertenezca a una extensión (unaccent, pg_trgm, etc.)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    -- Aunque ya se filtró, si alguna función tiene otro dueño se anota y se
    -- sigue, en vez de abortar la migración entera por un caso suelto.
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
                     f.proname, f.args);
      IF f.prosecdef THEN
        n_definer := n_definer + 1;
        RAISE NOTICE 'SECURITY DEFINER asegurada: %(%)', f.proname, f.args;
      ELSE
        n_normal := n_normal + 1;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      n_saltada := n_saltada + 1;
      RAISE NOTICE 'SALTADA (no somos dueños): %(%)', f.proname, f.args;
    END;
  END LOOP;

  RAISE NOTICE 'Listo. SECURITY DEFINER: %. Normales: %. Saltadas: %.',
               n_definer, n_normal, n_saltada;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Tiene que devolver CERO filas. Las de extensiones se excluyen igual que
-- arriba, porque no son responsabilidad de este proyecto.
SELECT p.proname AS funcion_sin_search_path,
       p.prosecdef AS es_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
  )
ORDER BY p.prosecdef DESC, p.proname;
