-- CmSports — se va la tabla `clases`, y los días de la ficha pasan a ser de la base
--
-- DOS COSAS EN UNA, porque la segunda es consecuencia de la primera:
--
-- 1. ADIÓS MÓDULO CLASES. Ningún club lo usa. La pantalla ya se había retirado
--    (redirect a /dashboard); acá se eliminan la tabla `clases` y sus satélites
--    `reservas` y `clase_jugadores`. El horario real vive en bloques_horario y
--    la asistencia se pasa directo sobre los bloques.
--
-- 2. LOS DÍAS DE LA FICHA LOS ESCRIBE LA BASE. `jugadores.entrena_lun..vie`,
--    `sede` y `horario` son espejos de las inscripciones a bloques. Hasta hoy
--    los escribía la app en un solo lugar (asignarBloquesJugador), pero
--    cerrar un día del grupo, quitar a alguien de un bloque o el traspaso de
--    club NO los tocaban: quedaban mintiendo. Desde ahora los recalcula un
--    trigger cada vez que cambia una inscripción o un bloque, y cualquier
--    intento de escribirlos a mano se corrige en silencio con el valor
--    canónico. No hay forma de que se desincronicen.
--
-- IMPORTANTE: correr esta migración apenas se despliegue el código que la
-- acompaña. El código nuevo ya no escribe los campos espejo: sin la migración,
-- dejarían de actualizarse.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. Adiós módulo clases ════════════════════════════════════════════════
-- El orden importa: primero los satélites que la referencian.
DROP TABLE IF EXISTS public.reservas CASCADE;
DROP TABLE IF EXISTS public.clase_jugadores CASCADE;
DROP TABLE IF EXISTS public.clases CASCADE;


-- ══ 2. El cálculo canónico de los días de un jugador ══════════════════════
--
-- Sale de sus inscripciones abiertas (vigente_hasta IS NULL) cruzadas con los
-- bloques que siguen vigentes hoy (hoy en Chile, no en UTC). Es el mismo
-- cálculo que hacía la app en asignarBloquesJugador, ahora en un solo lugar:
--   entrena_X  hay un bloque suyo ese día
--   sede       'ambos' si pisa las dos, si no la que sea; sin bloques, se deja
--              la que tenía (no se sabe dónde entrenaba)
--   horario    el rango HH:MM-HH:MM más repetido entre sus bloques

CREATE OR REPLACE FUNCTION public.dias_canonicos_jugador(p_jugador uuid)
RETURNS TABLE (
  o_lun boolean, o_mar boolean, o_mie boolean, o_jue boolean, o_vie boolean,
  o_sede text, o_horario text, o_tiene_bloques boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH b AS (
    SELECT bh.dia_semana, bh.sede,
           to_char(bh.hora_inicio, 'HH24:MI') || '-' || to_char(bh.hora_fin, 'HH24:MI') AS rango
    FROM bloque_jugadores bj
    JOIN bloques_horario bh ON bh.id = bj.bloque_id
    WHERE bj.jugador_id = p_jugador
      AND bj.vigente_hasta IS NULL
      AND (bh.vigente_hasta IS NULL
           OR bh.vigente_hasta >= (now() AT TIME ZONE 'America/Santiago')::date)
  )
  SELECT
    COALESCE(bool_or(dia_semana = 'lun'), false),
    COALESCE(bool_or(dia_semana = 'mar'), false),
    COALESCE(bool_or(dia_semana = 'mie'), false),
    COALESCE(bool_or(dia_semana = 'jue'), false),
    COALESCE(bool_or(dia_semana = 'vie'), false),
    CASE WHEN bool_or(sede = 'buin') AND bool_or(sede = 'paine') THEN 'ambos'
         WHEN bool_or(sede = 'buin')  THEN 'buin'
         WHEN bool_or(sede = 'paine') THEN 'paine' END,
    (SELECT rango FROM b GROUP BY rango ORDER BY count(*) DESC, rango LIMIT 1),
    count(*) > 0
  FROM b;
$$;

-- Aplica el cálculo sobre la fila del jugador. SECURITY DEFINER: lo dispara
-- también el profesor al inscribir, y su RLS no siempre puede escribir en
-- jugadores.
CREATE OR REPLACE FUNCTION public.aplicar_dias_jugador(p_jugador uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM dias_canonicos_jugador(p_jugador);
  UPDATE jugadores SET
    entrena_lun = c.o_lun, entrena_mar = c.o_mar, entrena_mie = c.o_mie,
    entrena_jue = c.o_jue, entrena_vie = c.o_vie,
    horario = c.o_horario,
    sede = CASE WHEN c.o_tiene_bloques THEN c.o_sede ELSE sede END
  WHERE id = p_jugador;
END;
$$;


-- ══ 3. Nadie escribe los espejos a mano ═══════════════════════════════════
-- Cualquier UPDATE que intente cambiar entrena_*, sede u horario se corrige
-- en silencio con el valor canónico. Silencio y no error, a propósito: así el
-- código viejo que todavía los escribe no revienta, simplemente deja de tener
-- efecto, y la transición no rompe nada en vuelo.

CREATE OR REPLACE FUNCTION public.jugadores_dias_solo_desde_bloques()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM dias_canonicos_jugador(NEW.id);
  NEW.entrena_lun := c.o_lun;
  NEW.entrena_mar := c.o_mar;
  NEW.entrena_mie := c.o_mie;
  NEW.entrena_jue := c.o_jue;
  NEW.entrena_vie := c.o_vie;
  NEW.horario     := c.o_horario;
  IF c.o_tiene_bloques THEN
    NEW.sede := c.o_sede;
  ELSE
    NEW.sede := OLD.sede;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jugadores_dias_solo_desde_bloques ON jugadores;
CREATE TRIGGER jugadores_dias_solo_desde_bloques
  BEFORE UPDATE OF entrena_lun, entrena_mar, entrena_mie, entrena_jue,
                   entrena_vie, sede, horario ON jugadores
  FOR EACH ROW
  WHEN (OLD.entrena_lun IS DISTINCT FROM NEW.entrena_lun
     OR OLD.entrena_mar IS DISTINCT FROM NEW.entrena_mar
     OR OLD.entrena_mie IS DISTINCT FROM NEW.entrena_mie
     OR OLD.entrena_jue IS DISTINCT FROM NEW.entrena_jue
     OR OLD.entrena_vie IS DISTINCT FROM NEW.entrena_vie
     OR OLD.sede        IS DISTINCT FROM NEW.sede
     OR OLD.horario     IS DISTINCT FROM NEW.horario)
  EXECUTE FUNCTION public.jugadores_dias_solo_desde_bloques();


-- ══ 4. Cada cambio de inscripción o de bloque resincroniza ════════════════

CREATE OR REPLACE FUNCTION public.sync_dias_tras_inscripcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM aplicar_dias_jugador(COALESCE(NEW.jugador_id, OLD.jugador_id));
  IF TG_OP = 'UPDATE' AND NEW.jugador_id IS DISTINCT FROM OLD.jugador_id THEN
    PERFORM aplicar_dias_jugador(OLD.jugador_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_dias_tras_inscripcion ON bloque_jugadores;
CREATE TRIGGER sync_dias_tras_inscripcion
  AFTER INSERT OR UPDATE OR DELETE ON bloque_jugadores
  FOR EACH ROW EXECUTE FUNCTION public.sync_dias_tras_inscripcion();

-- Editar el bloque (cambiarlo de día, de sede, de hora o cerrarlo) mueve los
-- días de todos sus inscritos abiertos.
CREATE OR REPLACE FUNCTION public.sync_dias_tras_bloque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT jugador_id FROM bloque_jugadores
           WHERE bloque_id = NEW.id AND vigente_hasta IS NULL LOOP
    PERFORM aplicar_dias_jugador(r.jugador_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_dias_tras_bloque ON bloques_horario;
CREATE TRIGGER sync_dias_tras_bloque
  AFTER UPDATE OF dia_semana, sede, hora_inicio, hora_fin,
                  vigente_desde, vigente_hasta ON bloques_horario
  FOR EACH ROW EXECUTE FUNCTION public.sync_dias_tras_bloque();


-- ══ 5. Resincronización inicial ═══════════════════════════════════════════
-- Una pasada por todos los jugadores para que el espejo arranque alineado.
-- Quien no tiene ninguna inscripción abierta queda con los días apagados, que
-- es la verdad según los bloques (la regla de la 083: bloques mandan).
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT id FROM jugadores LOOP
    PERFORM public.aplicar_dias_jugador(j.id);
  END LOOP;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) Intento manual: UPDATE jugadores SET entrena_lun = true WHERE id = '...';
--    → la fila queda con el valor canónico, no con el escrito.
-- 2) Cerrar una inscripción (vigente_hasta = hoy) apaga el día del jugador.
-- 3) SELECT to_regclass('public.clases') → NULL (la tabla ya no existe).
SELECT
  (SELECT count(*) FROM jugadores WHERE entrena_lun OR entrena_mar OR entrena_mie
     OR entrena_jue OR entrena_vie)                                        AS con_dias,
  (SELECT count(*) FROM jugadores j WHERE NOT EXISTS
     (SELECT 1 FROM bloque_jugadores bj WHERE bj.jugador_id = j.id
        AND bj.vigente_hasta IS NULL)
     AND (j.entrena_lun OR j.entrena_mar OR j.entrena_mie OR j.entrena_jue
          OR j.entrena_vie))                                               AS espejo_desalineado,
  to_regclass('public.clases')                                             AS tabla_clases;
