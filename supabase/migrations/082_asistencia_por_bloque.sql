-- La asistencia queda ligada al bloque real en el que se tomó.
--
-- Hasta ahora, cerrar un bloque solo guardaba jugador + fecha + hora. Como la
-- hora no distingue sede, el bloque de las 18:30 del lunes en Buin y el de las
-- 18:30 del lunes en Fátima eran indistinguibles: el profe veía a los dos
-- grupos mezclados en la misma lista y no había forma de saber, después, en
-- cuál de los dos se había registrado a cada uno.
--
-- Con `bloque_id` cada asistencia sabe a qué grupo pertenece. Eso arregla la
-- lista de hoy y además deja medible lo que viene: cuántos de los inscritos de
-- un bloque asistieron realmente.
--
-- La columna admite NULL a propósito: las asistencias históricas y las que el
-- jugador registra por su cuenta (autorregistro, kiosco por RUT) no vienen de
-- un cierre de bloque y se quedan sin él.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. La columna ─────────────────────────────────────────────────────────
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS bloque_id uuid
  REFERENCES public.bloques_horario(id) ON DELETE SET NULL;

-- Para responder "quiénes asistieron a este bloque en este rango de fechas",
-- que es la consulta de los reportes.
CREATE INDEX IF NOT EXISTS asistencia_bloque_fecha_idx
  ON public.asistencia (bloque_id, fecha);

-- ── 2. El cierre de bloque guarda de qué bloque se trata ──────────────────
-- Hay que borrar la versión de cinco parámetros antes de crear la de seis:
-- si conviven, PostgreSQL no sabe cuál elegir y la llamada falla por ambigua.
DROP FUNCTION IF EXISTS public.registrar_bloque_asistencia(uuid, date, time, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.registrar_bloque_asistencia(
  p_club_id   UUID,
  p_fecha     DATE,
  p_hora      TIME,
  p_presentes UUID[],
  p_ausentes  UUID[],
  p_bloque_id UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  jid UUID;
BEGIN
  -- El bloque tiene que ser del mismo club: es SECURITY DEFINER y se salta RLS.
  IF p_bloque_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM bloques_horario
    WHERE id = p_bloque_id AND club_id = p_club_id
  ) THEN
    RAISE EXCEPTION 'El bloque no pertenece al club';
  END IF;

  -- Presentes: insertar asistencia si no existe + incrementar sesiones
  FOREACH jid IN ARRAY COALESCE(p_presentes, '{}')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM asistencia
      WHERE jugador_id = jid AND fecha = p_fecha
    ) THEN
      INSERT INTO asistencia(club_id, jugador_id, fecha, hora, bloque_id)
      VALUES (p_club_id, jid, p_fecha, p_hora, p_bloque_id);
      UPDATE jugadores SET sesiones_usadas = sesiones_usadas + 1 WHERE id = jid AND estado = 'activo';
    END IF;
  END LOOP;

  -- Ausentes: solo sesión, solo si no tienen asistencia en esa fecha
  FOREACH jid IN ARRAY COALESCE(p_ausentes, '{}')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM asistencia
      WHERE jugador_id = jid AND fecha = p_fecha
    ) THEN
      UPDATE jugadores SET sesiones_usadas = sesiones_usadas + 1 WHERE id = jid AND estado = 'activo';
    END IF;
  END LOOP;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe devolver una fila: la función nueva, con seis parámetros.
SELECT p.proname,
       pg_get_function_arguments(p.oid) AS parametros
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_bloque_asistencia';
