-- ────────────────────────────────────────────────────────────
-- Torneos: guardar el MARCADOR de cada partido, no solo quién ganó.
--
-- Hoy `torneo_partidos` solo tiene `ganador`: el resultado se registra con un
-- clic ("A ✓" / "✓ B"). Sin marcador no hay forma de comparar a dos primeros
-- de grupos distintos que ganaron todos sus partidos, y por eso el reparto de
-- BYE del cuadro se decide hoy por un balance artificial de mitades en vez de
-- por mérito. Liga ya resolvió esto: `liga_partidos` tiene `sets_a`/`sets_b`
-- desde su primera versión. Esto le da a Torneos las mismas dos columnas.
--
-- Solo agrega columnas: no borra, no modifica y no reescribe ninguna fila
-- existente. Los partidos ya jugados quedan con `sets_a`/`sets_b` en NULL —
-- por eso son nullable — y el ranking los cuenta como 0 sets a favor y 0 en
-- contra. Nada que existe hoy deja de funcionar.
--
-- NO agrega `sets_favor`/`sets_contra` a `grupo_jugadores` a propósito: la
-- tabla de cada grupo la calcula `calcularStatsGrupo()` recorriendo los
-- partidos, no leyendo contadores de `grupo_jugadores`. Los sets se suman en
-- ese mismo recorrido. Contadores denormalizados serían un segundo lugar
-- donde el dato puede quedar desincronizado, y habría que revertirlos a mano
-- cada vez que se corrige un resultado.
--
-- Este cambio es de esquema y aplica a TODOS los clubes que usen Torneos.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('216_torneo_partidos_marcador');

ALTER TABLE torneo_partidos
  ADD COLUMN sets_a integer,
  ADD COLUMN sets_b integer;

COMMENT ON COLUMN torneo_partidos.sets_a IS
  'Sets ganados por jugador_a. NULL en partidos anteriores a la migración 216 y en los que aún no se juegan.';
COMMENT ON COLUMN torneo_partidos.sets_b IS
  'Sets ganados por jugador_b. NULL en partidos anteriores a la migración 216 y en los que aún no se juegan.';

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
-- Espera 2 filas, is_nullable = YES, column_default = NULL:
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'torneo_partidos' AND column_name IN ('sets_a', 'sets_b')
-- ORDER BY column_name;
