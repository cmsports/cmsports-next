-- ────────────────────────────────────────────────────────────
-- `asistencia` pasa a guardar A QUÉ BLOQUE fue, no solo que vino.
--
-- Este cambio afecta a: Asociación TDM Buin y Paine.
--
-- ── El pedido ──────────────────────────────────────────────────────────────
-- El profesor pidió, desde Reportes, poder ver el historial de quién asistió,
-- a qué bloque, en qué horario y en qué sede. Hoy `asistencia` solo tiene
-- jugador, fecha, hora y estado — nada de bloque.
--
-- ── Por qué no alcanza con inferirlo (y hoy se infiere) ───────────────────
-- `historialAsistencia.ts` ya reconstruye "a qué bloque fue" cruzando en qué
-- bloque estaba inscrito el jugador ese día de la semana. Funciona la mayoría
-- de las veces, pero se rompe cuando alguien está inscrito en DOS bloques el
-- mismo día (dos sedes, dos horarios): ahí no hay forma de saber a cuál fue,
-- solo una lista de candidatos.
--
-- Lo que hace falta es guardar el hecho, no seguir adivinándolo. Y la pantalla
-- donde se marca (`AsistenciaPanel.tsx`) YA sabe en qué bloque está parada
-- cuando el profe pasa lista — ese dato existe al momento de marcar y hoy se
-- descarta.
--
-- ── Qué NO se toca ─────────────────────────────────────────────────────────
-- La columna es nullable y no se completa retroactivamente: las filas de antes
-- de esta migración quedan con `bloque_id = NULL`, tal como quedaron
-- `sets_a`/`sets_b` en la 216 para los partidos viejos. El reporte nuevo las
-- sigue mostrando completando el bloque por inferencia, igual que hoy, y las
-- distingue como tal — no se inventa un bloque_id que nadie registró.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('242_asistencia_guarda_bloque');

-- ══ 1. La columna ═══════════════════════════════════════════════════════════
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS bloque_id uuid REFERENCES public.bloques_horario(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS asistencia_bloque_idx ON public.asistencia (bloque_id);

COMMENT ON COLUMN public.asistencia.bloque_id IS
  'En qué bloque marcó el profe, elegido en pantalla al pasar lista. NULL en todo lo anterior a la migración 242 — ahí el reporte lo completa por inferencia, no por dato guardado.';

-- ══ 2. registrar_asistencia_segura pasa a recibir el bloque ═══════════════
-- Cambia la firma (gana un parámetro), así que la versión vieja de 3
-- argumentos se reemplaza por esta de 4. `p_bloque_id` tiene DEFAULT NULL:
-- una llamada que todavía no lo mande (código viejo desplegado a medias)
-- sigue funcionando exactamente igual que hoy, solo sin guardar el bloque.
DROP FUNCTION IF EXISTS public.registrar_asistencia_segura(uuid, date, time);

CREATE OR REPLACE FUNCTION public.registrar_asistencia_segura(
  p_jugador_id uuid,
  p_fecha      date DEFAULT NULL,
  p_hora       time DEFAULT NULL,
  p_bloque_id  uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club       uuid;
  v_rol        text;
  v_club_staff uuid;
  v_fecha      date;
  v_hora       time;
  v_id         uuid;
BEGIN
  SELECT club_id, rol INTO v_club_staff, v_rol FROM perfiles WHERE id = auth.uid();

  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el profesor o el administrador registran la asistencia';
  END IF;

  SELECT club_id INTO v_club FROM jugadores WHERE id = p_jugador_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;

  -- El superadmin cruza clubes; el resto se queda en el suyo.
  IF v_rol <> 'superadmin' AND v_club IS DISTINCT FROM v_club_staff THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  -- NUEVO: si viene un bloque, tiene que ser de este mismo club. Un id que
  -- llega del navegador no se confía sin comprobar — mismo criterio que ya
  -- usa el resto de las funciones de bloques (226, 227).
  IF p_bloque_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM bloques_horario b WHERE b.id = p_bloque_id AND b.club_id = v_club
  ) THEN
    RAISE EXCEPTION 'Ese bloque no es de este club';
  END IF;

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santiago')::date);
  v_hora  := COALESCE(p_hora,  (now() AT TIME ZONE 'America/Santiago')::time);

  INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, bloque_id)
  VALUES (v_club, p_jugador_id, v_fecha, v_hora, 'presente', p_bloque_id)
  ON CONFLICT (jugador_id, fecha) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = v_fecha;
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_asistencia_segura(uuid, date, time, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_segura(uuid, date, time, uuid) TO authenticated;

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────

-- 1) La columna quedó, nullable, sin default:
-- SELECT column_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'asistencia' AND column_name = 'bloque_id';

-- 2) Solo existe la versión de 4 argumentos:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'registrar_asistencia_segura';

-- 3) Nadie tiene bloque_id todavía — es esperable justo después de aplicar
--    esta migración, antes de que el código nuevo empiece a marcar:
-- SELECT count(*) FILTER (WHERE bloque_id IS NOT NULL) AS con_bloque,
--        count(*) AS total
-- FROM asistencia WHERE fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 7;
