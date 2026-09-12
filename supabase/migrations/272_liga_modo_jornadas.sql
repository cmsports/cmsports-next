-- Ligas por jornadas: la forma de programar de Spinhouse, como dato de la liga.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Toda liga existente queda en `modo_programacion =
-- 'mesa_unica'`, que es exactamente lo que el módulo hizo siempre y lo que
-- Unión San Bernardo sigue usando. La tabla nueva nace vacía.
--
-- ══ Cómo programa Spinhouse (leído de su "Jornada 1", 2026-09-12) ═════════
--   · Una jornada es un fin de semana: sábado dos divisiones, domingo las
--     otras dos. Seis mesas, TRES por división, dos divisiones en paralelo.
--   · Bloques de 30 min desde las 15:00; cada bloque, la división ocupa sus
--     tres mesas. Los bloques no se fijan: salen de dividir los partidos por
--     las mesas (10 jugadores → 15 partidos → 5 bloques, termina 17:00).
--   · Cada jugador juega 3 partidos por jornada y arbitra en los bloques en
--     que no juega, con compromisos seguidos (hueco máximo 1).
--   · Qué día y qué mesas usa cada división se decide POR JORNADA: pueden
--     rotar, y con más divisiones se reparten las seis mesas de otra forma.
--
-- El motor actual (`programarDivision`) le da UNA mesa a cada división y
-- estira la fecha de 9:00 a 17:00. Es otro objetivo, no un ajuste del mismo:
-- por eso es un modo aparte, elegido por liga y no por club (CLAUDE.md:
-- las diferencias son dato). El motor nuevo vive en
-- src/lib/domain/ligaJornadas.ts.
--
-- ══ Qué agrega ════════════════════════════════════════════════════════════
--   · `ligas.modo_programacion`: 'mesa_unica' (hoy) | 'jornadas'.
--   · `ligas.partidos_por_jugador_por_fecha`: cuántos juega cada uno por
--     jornada en modo 'jornadas' (Spinhouse: 3). En 'mesa_unica' no se lee.
--   · `liga_fecha_sesiones`: por jornada y división, qué día del fin de
--     semana juega (0 = el día de la fecha, 1 = el siguiente) y con qué mesas
--     (números de `liga_mesas`). La fecha de `liga_fechas` es el primer día.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('272_liga_modo_jornadas');
SELECT _migracion_para_todos_los_clubes(
  'agrega dos columnas a ligas con el valor de siempre como default y una tabla nueva vacía; no toca ninguna fila');

ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS modo_programacion text NOT NULL DEFAULT 'mesa_unica',
  ADD COLUMN IF NOT EXISTS partidos_por_jugador_por_fecha smallint NOT NULL DEFAULT 3,
  -- El pie de la hoja de programación: reglas, contacto, dirección. Texto
  -- libre del club; NULL deja solo el nombre del club y de la liga.
  ADD COLUMN IF NOT EXISTS pie_programacion text;

ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_modo_programacion_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_modo_programacion_check
  CHECK (modo_programacion IN ('mesa_unica', 'jornadas'));

ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_partidos_por_jugador_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_partidos_por_jugador_check
  CHECK (partidos_por_jugador_por_fecha BETWEEN 1 AND 6);

COMMENT ON COLUMN public.ligas.modo_programacion IS
  'mesa_unica: una mesa por división, fechas largas (San Bernardo). jornadas: varias mesas por división, bloques hasta terminar, día y mesas por jornada (Spinhouse).';
COMMENT ON COLUMN public.ligas.partidos_por_jugador_por_fecha IS
  'Solo en modo jornadas: cuántos partidos juega cada jugador por jornada.';

CREATE TABLE IF NOT EXISTS public.liga_fecha_sesiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_id     uuid NOT NULL REFERENCES public.liga_fechas(id) ON DELETE CASCADE,
  division_id  uuid NOT NULL REFERENCES public.liga_divisiones(id) ON DELETE CASCADE,
  -- 0 = el día de la fecha (sábado), 1 = el siguiente (domingo).
  dia_offset   smallint NOT NULL DEFAULT 0 CHECK (dia_offset BETWEEN 0 AND 6),
  -- Números de mesa (los de liga_mesas.numero) que usa esta división ese día.
  mesas        int[] NOT NULL CHECK (cardinality(mesas) >= 1),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha_id, division_id)
);

COMMENT ON TABLE public.liga_fecha_sesiones IS
  'Modo jornadas: qué día del fin de semana y con qué mesas juega cada división en cada jornada.';

ALTER TABLE public.liga_fecha_sesiones ENABLE ROW LEVEL SECURITY;

-- Mismas reglas que liga_fechas: lee cualquiera del club, escribe el admin.
DROP POLICY IF EXISTS "liga_fecha_sesiones_select" ON public.liga_fecha_sesiones;
CREATE POLICY "liga_fecha_sesiones_select" ON public.liga_fecha_sesiones
  FOR SELECT USING (
    fecha_id IN (
      SELECT f.id FROM public.liga_fechas f
      JOIN public.ligas l ON l.id = f.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "liga_fecha_sesiones_admin_all" ON public.liga_fecha_sesiones;
CREATE POLICY "liga_fecha_sesiones_admin_all" ON public.liga_fecha_sesiones
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND fecha_id IN (
      SELECT f.id FROM public.liga_fechas f
      JOIN public.ligas l ON l.id = f.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND fecha_id IN (
      SELECT f.id FROM public.liga_fechas f
      JOIN public.ligas l ON l.id = f.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- 1) Toda liga existente quedó en el modo de siempre.
-- SELECT modo_programacion, count(*) FROM public.ligas GROUP BY 1;

-- 2) La tabla nueva existe, vacía y con RLS.
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'liga_fecha_sesiones';
-- SELECT count(*) FROM public.liga_fecha_sesiones;
