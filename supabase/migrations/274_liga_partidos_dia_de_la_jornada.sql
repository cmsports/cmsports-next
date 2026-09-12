-- Modo jornadas: el partido sabe qué día de la jornada juega.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Toda fila existente queda en `dia_offset = 0`, y el índice
-- único queda igual que antes para quien solo usa el día 0 (San Bernardo).
--
-- ══ Qué pasó ═════════════════════════════════════════════════════════════
-- Al cargar la Jornada 1 de Spinhouse (2026-09-12), el domingo falló en su
-- primer partido: «duplicate key value violates unique constraint
-- "liga_partidos_mesa_bloque_unico"». Ese índice (migración 016) dice que en
-- una fecha, una mesa no tiene dos partidos a la misma hora —correcto—, pero
-- en modo jornadas la fecha es el fin de semana entero: el sábado la mesa 1
-- a las 15:00 la usa la Honor y el domingo la Segunda, y para el índice eso
-- era el mismo partido.
--
-- El día ya estaba guardado, pero en otra tabla (`liga_fecha_sesiones`, por
-- división) y un índice no puede mirar ahí. Así que el partido lo lleva
-- puesto: `dia_offset`, 0 = el día de la fecha, 1 = el siguiente. En modo
-- mesa_unica siempre es 0 y nada cambia.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('274_liga_partidos_dia_de_la_jornada');
SELECT _migracion_para_todos_los_clubes(
  'agrega una columna a liga_partidos con default 0 y rehace un índice único incluyéndola; no cambia ninguna fila');

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS dia_offset smallint NOT NULL DEFAULT 0
    CHECK (dia_offset BETWEEN 0 AND 6);

COMMENT ON COLUMN public.liga_partidos.dia_offset IS
  'Modo jornadas: día de la jornada en que se juega (0 = la fecha, 1 = el siguiente). En mesa_unica siempre 0.';

DROP INDEX IF EXISTS public.liga_partidos_mesa_bloque_unico;
CREATE UNIQUE INDEX liga_partidos_mesa_bloque_unico
  ON public.liga_partidos (fecha_id, dia_offset, mesa_id, bloque_horario)
  WHERE fecha_id IS NOT NULL
    AND mesa_id IS NOT NULL
    AND bloque_horario IS NOT NULL
    AND deleted_at IS NULL;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- SELECT indexdef FROM pg_indexes WHERE indexname = 'liga_partidos_mesa_bloque_unico';
-- SELECT dia_offset, count(*) FROM public.liga_partidos GROUP BY 1;
