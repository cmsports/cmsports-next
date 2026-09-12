-- Spinhouse: encender el módulo de torneos por equipos.
--
-- Este cambio afecta a: Spinhouse. Una fila de `clubes`; ningún otro club
-- cambia.
--
-- El módulo `torneos_equipos` quedó apagado en la 266 hasta que existiera la
-- pantalla (Fase D del plan de modalidades). Ya existe:
-- /torneos/[id]/equipos, con equipos, encuentros, alineaciones y marcador.
-- Encenderlo solo hace que "Por equipos" aparezca en el selector al crear un
-- torneo externo; los torneos que ya existen no cambian.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('277_torneos_equipos_spinhouse');
SELECT _migracion_para_club('Spinhouse');

DO $$
DECLARE
  v_club uuid := current_setting('cmsports.club_declarado', true)::uuid;
BEGIN
  UPDATE public.clubes
  SET    modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'torneos_equipos')
  WHERE  id = v_club
    AND  NOT ('torneos_equipos' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
END $$;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────
-- SELECT nombre, 'torneos_equipos' = ANY(modulos_habilitados) AS equipos FROM public.clubes ORDER BY nombre;
