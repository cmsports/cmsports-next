-- ────────────────────────────────────────────────────────────
-- `limpiar_jugadores_externos()` se puede llamar SIN INICIAR SESIÓN y borra
-- los jugadores externos de TODOS los clubes.
--
-- ── Qué es ────────────────────────────────────────────────────────────────
-- La creó la migración 061 como `SECURITY DEFINER` y desde entonces:
--   · no comprueba sesión, ni rol, ni club — ni una línea;
--   · en las 215 migraciones NO existe un solo REVOKE sobre ella.
--
-- En PostgreSQL una función nace con EXECUTE para PUBLIC, y PostgREST expone
-- las funciones de `public` como RPC a `anon` y `authenticated`. Es decir:
-- cualquiera con la URL del proyecto y la llave pública puede ejecutarla.
--
-- Lo que hace en una sola llamada, sin filtrar por club:
--   UPDATE perfiles SET jugador_id = NULL   (todos los externos)
--   DELETE FROM torneo_felicitaciones / asistencia / clase_jugadores /
--               reservas / mensualidades / torneo_partidos / grupo_jugadores
--   DELETE FROM jugadores WHERE es_externo = TRUE
--
-- Borra `torneo_partidos` ANTES que `grupo_jugadores`, así que el blindaje de
-- la migración 215 no la frena: cuando el trigger revisa si el partido sigue
-- existiendo, ya no existe.
--
-- Es la misma destrucción que la migración 060 —anulada por peligrosa en su
-- propio encabezado— pero disponible por HTTP.
--
-- ── Por qué se escapó de las auditorías anteriores ────────────────────────
-- La 134 auditó exactamente esta clase de agujero y cerró cuatro funciones
-- (traspasar_jugador, eliminar_jugador_atomico, presupuesto_vs_real,
-- consumir_sesion_sin_asistencia). Esta no entró en la lista.
--
-- La 199 y la 210 sí la nombran, y las dos la describen como peligrosa
-- («limpiar_jugadores_externos — borra fichas»), pero ambas solo le fijaron
-- el `search_path`. Se arregló cómo resuelve los nombres de tabla; nunca
-- quién puede llamarla.
--
-- ── Qué hace esta migración ───────────────────────────────────────────────
-- La revoca y la borra. No se conserva porque no la llama nadie: `grep -rn
-- "limpiar_jugadores_externos" src/ scripts/` no devuelve una sola línea de
-- código de la aplicación. La limpieza real de externos al terminar un torneo
-- la hace `limpiarExternosDeTorneo` en src/app/actions/torneos.ts, que sí
-- respeta campeón, subcampeón, partidos jugados y torneo de origen.
--
-- Mismo criterio que la 136 con `presupuesto_vs_real`: una función
-- privilegiada que nadie usa no se deja "por si acaso", se saca.
--
-- No borra ni una fila de datos: solo suelta una definición de función.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('226_cerrar_limpiar_jugadores_externos');

-- ══ 1. Dejar constancia de con qué permisos estaba ═════════════════════════
-- Se anota en el log de la corrida para poder decir después, con evidencia,
-- si el agujero estuvo abierto o si alguien ya lo había cerrado desde el panel.
DO $$
DECLARE v_acl text;
BEGIN
  SELECT COALESCE(p.proacl::text, '(sin ACL: EXECUTE para PUBLIC)')
    INTO v_acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = 'limpiar_jugadores_externos';

  IF v_acl IS NULL THEN
    RAISE NOTICE 'La función no existe en esta base: nada que cerrar.';
  ELSE
    RAISE NOTICE 'Permisos que tenía limpiar_jugadores_externos: %', v_acl;
  END IF;
END $$;

-- ══ 2. Revocar antes de soltar ═════════════════════════════════════════════
-- El REVOKE por sí solo ya cierra el agujero. Va primero y por separado del
-- DROP para que, si el DROP fallara por una dependencia inesperada, el acceso
-- quede cerrado igual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.proname = 'limpiar_jugadores_externos'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.limpiar_jugadores_externos() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ══ 3. Soltarla ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.limpiar_jugadores_externos();

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) La función ya no existe: cero filas.
SELECT p.proname, p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'limpiar_jugadores_externos';

-- 2) Barrido general: ninguna SECURITY DEFINER de `public` debería quedar
--    ejecutable por `anon` o por PUBLIC. Esta consulta es la que hay que
--    volver a correr cada vez que se agregue una función privilegiada.
SELECT p.proname,
       COALESCE(p.proacl::text, 'SIN ACL → EXECUTE PARA PUBLIC') AS permisos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.prosecdef
  AND p.prokind = 'f'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND (
    p.proacl IS NULL
    OR EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) a
      WHERE a.grantee = 0 OR a.grantee = 'anon'::regrole
    )
  )
ORDER BY p.proname;
-- Las que aparezcan acá hay que revisarlas una por una: o tienen su propio
-- chequeo de sesión y rol en el cuerpo (como corregir_mensualidad o
-- registrar_asistencia_manual, que sí lo tienen), o les falta un REVOKE.
