-- Liga: guardar los parciales y los puntos de cada partido, no solo los sets.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Solo agrega columnas que nacen en NULL; ninguna fila se
-- toca. Un partido sin puntos cuenta 0 a favor y 0 en contra, así que el
-- ranking de San Bernardo queda exactamente como está.
--
-- ══ Por qué ══════════════════════════════════════════════════════════════
-- El ranking de una división desempata por puntos de liga, partidos ganados,
-- diferencia de sets y sets a favor. En un todos contra todos con 10 a 15
-- jugadores eso empata seguido (dos con 3-1 y 1-3 quedan iguales), y el
-- siguiente escalón del reglamento es el ratio de PUNTOS. Para tenerlo hay
-- que anotar los parciales (11-9, 11-7, …), que además son lo que va en la
-- planilla de resultados que se manda al grupo.
--
--   · `parciales`: los sets tal cual, [[11,9],[11,7],[9,11],[11,5]].
--   · `puntos_a` / `puntos_b`: la suma, que es lo único que usa el desempate
--     (misma idea que la 225 en torneos).
-- Los sets (`sets_a`/`sets_b`) se siguen guardando: son lo que ya consume
-- todo el módulo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('276_liga_partidos_puntos');
SELECT _migracion_para_todos_los_clubes(
  'agrega tres columnas a liga_partidos que nacen en NULL; no cambia ninguna fila');

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS puntos_a  integer,
  ADD COLUMN IF NOT EXISTS puntos_b  integer,
  ADD COLUMN IF NOT EXISTS parciales jsonb;

COMMENT ON COLUMN public.liga_partidos.puntos_a IS
  'Puntos TOTALES de jugador_a sumando todos los sets. NULL si el resultado se cargó sin parciales.';
COMMENT ON COLUMN public.liga_partidos.puntos_b IS
  'Puntos TOTALES de jugador_b sumando todos los sets. NULL si el resultado se cargó sin parciales.';
COMMENT ON COLUMN public.liga_partidos.parciales IS
  'Los sets tal cual: [[11,9],[11,7],...]. De acá salen sets_a/sets_b y puntos_a/puntos_b.';

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'liga_partidos' AND column_name IN ('puntos_a','puntos_b','parciales');
