-- CmSports — el par (jugador_id, club_id) queda blindado en la base
--
-- Contexto: la auditoria del 2026-07-29 encontro varias formas de que las
-- filas de asistencia, mensualidades y clases extras se descolguen del club
-- del jugador. La 108/109 arreglaron el caso de Daniel pero no cerraron la
-- puerta: cambiar jugadores.club_id a mano seguia dejando basura, el traspaso
-- no movia perfiles ni cerraba las inscripciones viejas, y ninguna tabla
-- comprobaba que jugador y club coincidan. Esta migracion pone la regla en la
-- base: (1) blindar la columna, (2) ampliar el traspaso a todo lo que hace
-- falta y (3) sostenerlo con triggers que rechazan cualquier fila incoherente.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. traspasar_jugador amplia: perfiles + bloque_jugadores + bloque_id ══
--
-- La 109 movia jugadores + asistencia + mensualidades + clases_extras. Faltaba:
--   · perfiles.club_id: la cuenta del jugador logueado, sin esto sigue viendo
--     el club anterior en su propia sesion.
--   · bloque_jugadores: las inscripciones abiertas del club viejo apuntan a
--     bloques que no pertenecen al club nuevo. Se cierran con vigente_hasta.
--   · clases_extraordinarias.bloque_id: los bloques son del club viejo. Poner
--     NULL evita que un JOIN devuelva un bloque de otro club.
--
-- La variable de sesion `cmsports.traspaso_activo` le avisa al trigger que
-- protege jugadores.club_id que este UPDATE es legitimo (ver punto 2). Se
-- setea local a la transaccion y se limpia sola al terminar.

CREATE OR REPLACE FUNCTION public.traspasar_jugador(
  p_jugador_id     uuid,
  p_club_id_nuevo  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actor      text;
  v_club_id_viejo  uuid;
BEGIN
  IF p_jugador_id IS NULL OR p_club_id_nuevo IS NULL THEN
    RAISE EXCEPTION 'Falta el jugador o el club de destino';
  END IF;

  SELECT rol INTO v_rol_actor FROM perfiles WHERE id = auth.uid();
  IF v_rol_actor NOT IN ('admin', 'profesor', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el admin, el profesor o el superadmin pueden traspasar un jugador';
  END IF;

  SELECT club_id INTO v_club_id_viejo FROM jugadores WHERE id = p_jugador_id;
  IF v_club_id_viejo IS NULL THEN
    RAISE EXCEPTION 'Jugador % no existe', p_jugador_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = p_club_id_nuevo) THEN
    RAISE EXCEPTION 'Club de destino % no existe', p_club_id_nuevo;
  END IF;

  -- Autorizar el cambio de jugadores.club_id ante el trigger de blindaje.
  PERFORM set_config('cmsports.traspaso_activo', p_jugador_id::text, true);

  UPDATE jugadores SET club_id = p_club_id_nuevo
    WHERE id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE asistencia SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE mensualidades SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  -- clases_extras: mueve el club (para que se vean en el nuevo) y desasocia
  -- el bloque_id que quedaria apuntando a un bloque de otro club.
  UPDATE clases_extraordinarias
     SET club_id = p_club_id_nuevo,
         bloque_id = NULL
    WHERE jugador_id = p_jugador_id
      AND (club_id IS DISTINCT FROM p_club_id_nuevo OR bloque_id IS NOT NULL);

  -- Cerrar las inscripciones abiertas: los bloques son del club viejo, no
  -- valen para el nuevo. El admin del club receptor lo inscribe en los suyos.
  UPDATE bloque_jugadores bj
     SET vigente_hasta = current_date
    FROM bloques_horario b
   WHERE bj.bloque_id = b.id
     AND bj.jugador_id = p_jugador_id
     AND bj.vigente_hasta IS NULL
     AND b.club_id IS DISTINCT FROM p_club_id_nuevo;

  -- El perfil del jugador logueado: sin esto sigue viendo el club anterior.
  UPDATE perfiles SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  PERFORM set_config('cmsports.traspaso_activo', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.traspasar_jugador(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.traspasar_jugador(uuid, uuid) TO authenticated;


-- ══ 2. Blindar jugadores.club_id: solo se cambia via traspasar_jugador ══
--
-- Cambiar la columna a mano era el origen del bug de Daniel. El trigger deja
-- pasar el UPDATE unicamente si la variable de sesion coincide con el id del
-- jugador que se esta moviendo — esa variable la setea traspasar_jugador y se
-- limpia al terminar la transaccion. Un UPDATE suelto desde Supabase, un
-- script o cualquier action nueva mal escrita falla con un mensaje claro.

CREATE OR REPLACE FUNCTION public.jugadores_club_id_solo_traspaso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.club_id IS DISTINCT FROM NEW.club_id
     AND current_setting('cmsports.traspaso_activo', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Cambiar el club de un jugador requiere pasar por traspasar_jugador()';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jugadores_club_id_solo_traspaso ON jugadores;
CREATE TRIGGER jugadores_club_id_solo_traspaso
  BEFORE UPDATE OF club_id ON jugadores
  FOR EACH ROW EXECUTE FUNCTION public.jugadores_club_id_solo_traspaso();


-- ══ 3. Consistencia jugador <-> club en las tablas dependientes ══
--
-- INSERT o cambio de (jugador_id, club_id) tiene que coincidir con el club
-- actual del jugador. El trigger evita la clase de descolgue que teniamos:
-- una fila con club_id = A y jugador de club B. Se corre en insert y en el
-- update que toca esas columnas, no en cualquier otro update — asi las filas
-- viejas y descolgadas se pueden seguir manipulando sin fallar en cadena.

CREATE OR REPLACE FUNCTION public.check_jugador_club_coincide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_jugador uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.club_id IS NOT DISTINCT FROM OLD.club_id
     AND NEW.jugador_id IS NOT DISTINCT FROM OLD.jugador_id THEN
    RETURN NEW;
  END IF;

  SELECT club_id INTO v_club_jugador FROM jugadores WHERE id = NEW.jugador_id;
  IF v_club_jugador IS NULL THEN
    RAISE EXCEPTION 'Jugador % no existe', NEW.jugador_id;
  END IF;

  IF v_club_jugador IS DISTINCT FROM NEW.club_id THEN
    RAISE EXCEPTION 'El club_id (%) no coincide con el club actual del jugador (%)',
      NEW.club_id, v_club_jugador;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS asistencia_check_club ON asistencia;
CREATE TRIGGER asistencia_check_club
  BEFORE INSERT OR UPDATE OF club_id, jugador_id ON asistencia
  FOR EACH ROW EXECUTE FUNCTION public.check_jugador_club_coincide();

DROP TRIGGER IF EXISTS mensualidades_check_club ON mensualidades;
CREATE TRIGGER mensualidades_check_club
  BEFORE INSERT OR UPDATE OF club_id, jugador_id ON mensualidades
  FOR EACH ROW EXECUTE FUNCTION public.check_jugador_club_coincide();

DROP TRIGGER IF EXISTS clases_extra_check_club ON clases_extraordinarias;
CREATE TRIGGER clases_extra_check_club
  BEFORE INSERT OR UPDATE OF club_id, jugador_id ON clases_extraordinarias
  FOR EACH ROW EXECUTE FUNCTION public.check_jugador_club_coincide();


-- ══ 4. No borrar bloques: cerrar con vigente_hasta ══
--
-- El schema tenia ON DELETE CASCADE en bloque_jugadores.bloque_id y en
-- bloque_excepciones.bloque_id. Un DELETE del bloque perdia la historia de
-- quienes estaban inscritos y cuando falto el club. La convencion del
-- proyecto es cerrar con vigente_hasta, no eliminar. Se cambia a RESTRICT
-- para que la base rechace un DELETE hasta que se cierre lo que corresponde.

ALTER TABLE bloque_jugadores
  DROP CONSTRAINT IF EXISTS bloque_jugadores_bloque_id_fkey;
ALTER TABLE bloque_jugadores
  ADD CONSTRAINT bloque_jugadores_bloque_id_fkey
  FOREIGN KEY (bloque_id) REFERENCES bloques_horario(id) ON DELETE RESTRICT;

ALTER TABLE bloque_excepciones
  DROP CONSTRAINT IF EXISTS bloque_excepciones_bloque_id_fkey;
ALTER TABLE bloque_excepciones
  ADD CONSTRAINT bloque_excepciones_bloque_id_fkey
  FOREIGN KEY (bloque_id) REFERENCES bloques_horario(id) ON DELETE RESTRICT;


-- ══ 5. Parche puntual: terminar de traspasar a Daniel ══
--
-- Las 108 y 109 movieron asistencia, mensualidades y clases extras, pero no
-- tocaron perfiles ni las inscripciones viejas. Este bloque termina el
-- traspaso para Daniel usando la nueva version de la funcion. Es idempotente:
-- si ya esta todo alineado, el UPDATE encuentra 0 filas y no cambia nada.

DO $$
DECLARE
  v_club_buin  uuid;
  v_jugador    uuid;
  v_club_actual uuid;
BEGIN
  SELECT id INTO v_club_buin FROM clubes
    WHERE lower(nombre) LIKE '%buin%' LIMIT 1;
  IF v_club_buin IS NULL THEN RETURN; END IF;

  SELECT id, club_id INTO v_jugador, v_club_actual FROM jugadores
    WHERE club_id = v_club_buin
      AND lower(nombre) LIKE 'daniel torres%'
    LIMIT 1;
  IF v_jugador IS NULL THEN RETURN; END IF;

  -- Cerrar inscripciones viejas: bloques que no son de Buin.
  UPDATE bloque_jugadores bj
     SET vigente_hasta = current_date
    FROM bloques_horario b
   WHERE bj.bloque_id = b.id
     AND bj.jugador_id = v_jugador
     AND bj.vigente_hasta IS NULL
     AND b.club_id IS DISTINCT FROM v_club_buin;

  -- clases_extras que quedaron con bloque_id de otro club.
  UPDATE clases_extraordinarias
     SET bloque_id = NULL
    FROM bloques_horario b
   WHERE clases_extraordinarias.bloque_id = b.id
     AND clases_extraordinarias.jugador_id = v_jugador
     AND b.club_id IS DISTINCT FROM v_club_buin;

  -- Perfil del jugador loguerado.
  UPDATE perfiles SET club_id = v_club_buin
   WHERE jugador_id = v_jugador AND club_id IS DISTINCT FROM v_club_buin;
END $$;


COMMIT;


-- ── Verificacion ────────────────────────────────────────────────────────
-- 1) Traspasar rechaza cambios de club_id fuera del flujo:
--    UPDATE jugadores SET club_id = '...' WHERE id = '...';
--    -> "Cambiar el club de un jugador requiere pasar por traspasar_jugador()"
-- 2) Insertar asistencia con club mal puesto:
--    INSERT INTO asistencia (club_id, jugador_id, fecha) VALUES ('X', 'Y', now())
--    -> "El club_id no coincide con el club actual del jugador"
-- 3) Borrar un bloque con inscripciones abiertas:
--    DELETE FROM bloques_horario WHERE id = '...'
--    -> error de constraint (bloque_jugadores_bloque_id_fkey)
