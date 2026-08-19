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
-- No cambia la lógica de ninguna función: sólo fija en qué esquemas busca los
-- nombres. `public, pg_temp` es el mismo valor que ya usan las funciones de
-- finanzas desde la 039.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('199_search_path_funciones');

DO $$
DECLARE f record; n_definer int := 0; n_normal int := 0;
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
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
                   f.proname, f.args);
    IF f.prosecdef THEN
      n_definer := n_definer + 1;
      RAISE NOTICE 'SECURITY DEFINER asegurada: %(%)', f.proname, f.args;
    ELSE
      n_normal := n_normal + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Listo. SECURITY DEFINER corregidas: %. Funciones normales: %.', n_definer, n_normal;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Tiene que devolver CERO filas. Si devuelve alguna, quedó sin arreglar.
SELECT p.proname AS funcion_sin_search_path, p.prosecdef AS es_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
  )
ORDER BY p.prosecdef DESC, p.proname;
