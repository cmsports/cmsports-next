-- Spinhouse: el módulo de liga por jornadas y su puntaje (2 / 1 / 0).
--
-- Este cambio afecta a: Spinhouse. Dos filas de club_config y un módulo en
-- su lista; ningún otro club cambia. Va después de la 272, que agrega el
-- modo de programación a las ligas para todos.
--
-- ══ Qué pidió el club ══════════════════════════════════════════════════════
--   · Su liga se programa por jornadas (ver 272): el módulo `liga_jornadas`
--     es lo que enciende la opción al crear una liga, la pantalla de jornadas
--     (importar la programación publicada, proyectar la siguiente, PDF) y nada
--     más. San Bernardo sigue con el modo de siempre sin ver nada de esto.
--   · Puntaje: 2 la victoria, 1 la derrota, 0 la no presentación (W.O.). El
--     sistema trae 3 / 1 / 0 (lo de Buin), así que solo cambia la victoria.
--     Las claves ya existen en el catálogo (`liga.puntos_*`); acá se les da
--     el valor de Spinhouse.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('273_liga_jornadas_spinhouse');
SELECT _migracion_para_club('Spinhouse');

DO $$
DECLARE
  v_club uuid := current_setting('cmsports.club_declarado', true)::uuid;
BEGIN
  -- 1) El módulo, sumado al array actual (nunca una lista escrita a mano).
  UPDATE public.clubes
  SET    modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'liga_jornadas')
  WHERE  id = v_club
    AND  NOT ('liga_jornadas' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

  -- 2) El puntaje. Derrota (1) y W.O. (0) coinciden con el default: solo se
  --    escribe la victoria, y solo si el club no la había fijado ya a mano.
  INSERT INTO public.club_config (club_id, clave, valor)
  VALUES (v_club, 'liga.puntos_victoria', '2'::jsonb)
  ON CONFLICT (club_id, clave) DO NOTHING;
END $$;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- Solo Spinhouse tiene el módulo y el puntaje.
-- SELECT c.nombre, 'liga_jornadas' = ANY(c.modulos_habilitados) AS jornadas,
--        (SELECT valor FROM public.club_config k WHERE k.club_id = c.id AND k.clave = 'liga.puntos_victoria') AS victoria
-- FROM public.clubes c ORDER BY c.nombre;
