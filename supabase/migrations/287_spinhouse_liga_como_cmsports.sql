-- Spinhouse vuelve a la liga de siempre de CM Sports.
--
-- Este cambio afecta a: Spinhouse. Deshace la 273: le saca el módulo
-- `liga_jornadas` y borra sus filas `liga.*` de club_config. Ningún otro club
-- cambia.
--
-- ══ Por qué ════════════════════════════════════════════════════════════════
-- El club no usó la liga por jornadas (2026-10-03). Sin el módulo, al crear una
-- liga no aparece el modo jornadas ni su pantalla; sin las filas `liga.*`, cada
-- clave cae en su default del catálogo (`src/lib/domain/clubConfig.ts`), que es
-- lo que hace Buin: 3 / 1 / 0 en vez del 2 / 1 / 0 de la 273.
--
-- No borra ligas: Spinhouse no tiene ninguna (verificado el 2026-10-03, la
-- consulta por club devolvió 0 filas). Tampoco toca el código de jornadas:
-- queda apagado, y parte de él (resultados set a set, PDF de la fecha) ya lo
-- usa la liga normal.
--
-- ══ Lo que borra ═══════════════════════════════════════════════════════════
-- Solo filas de club_config de Spinhouse cuya clave empieza con `liga.`. Se
-- respaldan antes en una tabla con nombre único (ver
-- docs/migraciones-destructivas.md §1): si la migración se pega dos veces, el
-- CREATE TABLE falla y no se borra nada sin copia. Además la frena
-- `_migracion_nueva`.
--
-- Para volver atrás:
--   INSERT INTO public.club_config (club_id, clave, valor)
--   SELECT club_id, clave, valor FROM public._respaldo_club_config_liga_287_20261003;
--   + volver a agregar 'liga_jornadas' a clubes.modulos_habilitados.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-10-03

-- Ya cumplió su función. Borra filas: no se repite (docs/migraciones-destructivas.md).
DO $$
BEGIN
  RAISE EXCEPTION 'Migración 287 anulada: ya se ejecutó el 2026-10-03. No repetir.';
END $$;

BEGIN;
SELECT _migracion_nueva('287_spinhouse_liga_como_cmsports');
SELECT _migracion_para_club('Spinhouse');

-- 1) Respaldo de lo que se va a borrar. La condición se escribe UNA vez, acá.
CREATE TABLE public._respaldo_club_config_liga_287_20261003 AS
SELECT *
FROM   public.club_config
WHERE  club_id = current_setting('cmsports.club_declarado', true)::uuid
  AND  clave LIKE 'liga.%';

-- Mismo criterio que las demás `_respaldo_*` (migración 284): RLS sin
-- políticas y sin permisos para la API.
ALTER TABLE public._respaldo_club_config_liga_287_20261003 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._respaldo_club_config_liga_287_20261003 FROM anon, authenticated;

-- 2) El puntaje y demás claves de liga vuelven a su default.
DELETE FROM public.club_config
WHERE  (club_id, clave) IN (
  SELECT club_id, clave FROM public._respaldo_club_config_liga_287_20261003
);

-- 3) Fuera el módulo de jornadas, sin tocar el resto de la lista.
UPDATE public.clubes
SET    modulos_habilitados = array_remove(modulos_habilitados, 'liga_jornadas')
WHERE  id = current_setting('cmsports.club_declarado', true)::uuid
  AND  'liga_jornadas' = ANY(modulos_habilitados);

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- Ningún club tiene el módulo de jornadas, y Spinhouse no tiene claves de liga.
-- SELECT c.nombre,
--        'liga_jornadas' = ANY(c.modulos_habilitados) AS jornadas,
--        (SELECT count(*) FROM public.club_config k
--          WHERE k.club_id = c.id AND k.clave LIKE 'liga.%') AS claves_liga
-- FROM public.clubes c ORDER BY c.nombre;

-- Lo respaldado (debe calzar con lo que mostró la consulta previa).
-- SELECT clave, valor FROM public._respaldo_club_config_liga_287_20261003;
