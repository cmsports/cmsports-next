-- El freno de la 306 se limita a los partidos que tienen grupo.
--
-- ── El problema ───────────────────────────────────────────────────────────
-- La 306 frena dejar un partido de fase 'grupos' de un torneo en curso con un
-- jugador en NULL. Pero el torneo POR EQUIPOS también guarda sus partidos
-- individuales con fase = 'grupos' (son los del todos contra todos de
-- encuentros), y sin grupo: `grupo_id` queda NULL y el partido cuelga de
-- `encuentro_id`. Sus jugadores no están en ningún grupo, solo en la MESA, así
-- que "Eliminar jugador" no tiene nada que retirar antes de borrar.
--
-- Resultado: eliminar a alguien que ya jugó en un torneo por equipos en curso
-- quedaba frenado por la base, con un mensaje que manda a retirarlo desde el
-- torneo, y no hay forma de retirarlo de un torneo por equipos. Antes de la
-- 306 ese borrado funcionaba.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────
-- Solo la condición del trigger: además de fase 'grupos', el partido tiene que
-- tener grupo. Los grupos del tradicional y de la liguilla siguen frenados
-- igual que con la 306; los partidos de los encuentros por equipos vuelven a
-- comportarse como antes. No modifica ninguna fila al aplicarse.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________

BEGIN;
SELECT _migracion_nueva('307_freno_solo_partidos_con_grupo');
SELECT _migracion_para_todos_los_clubes('ajusta la condición de un trigger compartido de torneos; no modifica filas al aplicar');

DROP TRIGGER IF EXISTS trg_frenar_partido_de_grupo_sin_jugador ON public.torneo_partidos;
CREATE TRIGGER trg_frenar_partido_de_grupo_sin_jugador
BEFORE UPDATE OF jugador_a, jugador_b ON public.torneo_partidos
FOR EACH ROW
WHEN (
  NEW.fase = 'grupos'
  AND NEW.grupo_id IS NOT NULL
  AND (
    (OLD.jugador_a IS NOT NULL AND NEW.jugador_a IS NULL)
    OR (OLD.jugador_b IS NOT NULL AND NEW.jugador_b IS NULL)
  )
)
EXECUTE FUNCTION public._frenar_partido_de_grupo_sin_jugador();

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lee) ───────────
-- La condición del trigger tiene que mencionar grupo_id:
-- SELECT pg_get_triggerdef(oid) LIKE '%grupo_id IS NOT NULL%' AS limitado_a_grupos
-- FROM pg_trigger WHERE tgname = 'trg_frenar_partido_de_grupo_sin_jugador';
