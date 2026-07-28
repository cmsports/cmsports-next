-- La clase extra deja de exigir un bloque.
--
-- EL ERROR. La 098 pedía `p_bloque_id` obligatorio. Pero el caso más común es
-- justo el que no tiene bloque: el jugador que hoy no entrena y viene igual. Al
-- no poder registrarlo, la pantalla terminaba bloqueando al profe con un
-- mensaje en vez de anotar la clase. Marcar que alguien vino tiene que ser un
-- toque, siempre; de qué grupo fue y cuánto cuesta se resuelve después.
--
-- Ahora `p_bloque_id` admite NULL y significa exactamente eso: vino de más y
-- todavía no se dijo a qué grupo. Se puede completar más tarde.
--
-- El duplicado con bloque NULL se comprueba a mano y no con ON CONFLICT: la
-- restricción única de la 098 es (jugador, fecha, bloque), y en SQL dos NULL no
-- son iguales entre sí, así que esa restricción no atrapa el caso. Un índice
-- parcial tampoco serviría: no se puede apuntarle un ON CONFLICT.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_clase_extraordinaria(
  p_jugador_id uuid,
  p_fecha      date,
  p_bloque_id  uuid DEFAULT NULL,
  p_hora       time DEFAULT NULL,
  p_monto      integer DEFAULT NULL,
  p_motivo     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_id   uuid;
  v_dia  text;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();

  -- El NULL se comprueba aparte: en SQL `NULL NOT IN (...)` no es verdadero.
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden registrar una clase extraordinaria';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF p_monto IS NOT NULL AND p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  -- El día de la semana en el formato del horario. extract(dow) da 0 para
  -- domingo; el club solo funciona de lunes a viernes.
  v_dia := (ARRAY[NULL,'lun','mar','mie','jue','vie',NULL])[extract(dow FROM p_fecha)::int + 1];
  IF v_dia IS NULL THEN
    RAISE EXCEPTION 'El club no abre los fines de semana';
  END IF;

  IF p_bloque_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = p_bloque_id AND club_id = v_club) THEN
      RAISE EXCEPTION 'El bloque no es de este club';
    END IF;

    -- Lo que la hace extraordinaria: no estaba inscrito en ESE grupo ESA fecha.
    IF EXISTS (
      SELECT 1 FROM bloque_jugadores bj
      WHERE bj.bloque_id = p_bloque_id
        AND bj.jugador_id = p_jugador_id
        AND bj.vigente_desde <= p_fecha
        AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= p_fecha)
    ) THEN
      RAISE EXCEPTION 'Ese jugador sí pertenece a ese grupo: su asistencia es la normal, no una extra';
    END IF;

    INSERT INTO clases_extraordinarias
      (club_id, jugador_id, fecha, bloque_id, hora, monto, motivo, registrado_por)
    VALUES
      (v_club, p_jugador_id, p_fecha, p_bloque_id,
       COALESCE(p_hora, (now() AT TIME ZONE 'America/Santiago')::time),
       p_monto, NULLIF(btrim(p_motivo), ''), auth.uid())
    ON CONFLICT ON CONSTRAINT clases_extra_unica DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM clases_extraordinarias
      WHERE jugador_id = p_jugador_id AND fecha = p_fecha AND bloque_id = p_bloque_id;
    END IF;

  ELSE
    -- Sin bloque: solo vale para quien ese día no tenía ninguno. Si le tocaba
    -- entrenar, su asistencia es la normal y hay que elegir a qué grupo vino.
    IF EXISTS (
      SELECT 1
      FROM bloque_jugadores bj
      JOIN bloques_horario b ON b.id = bj.bloque_id
      WHERE bj.jugador_id = p_jugador_id
        AND b.club_id = v_club
        AND b.dia_semana = v_dia
        AND bj.vigente_desde <= p_fecha
        AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= p_fecha)
        AND b.vigente_desde <= p_fecha
        AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= p_fecha)
    ) THEN
      RAISE EXCEPTION 'Ese jugador sí entrena ese día: elegí a qué grupo vino';
    END IF;

    SELECT id INTO v_id FROM clases_extraordinarias
    WHERE jugador_id = p_jugador_id AND fecha = p_fecha AND bloque_id IS NULL;

    IF v_id IS NULL THEN
      INSERT INTO clases_extraordinarias
        (club_id, jugador_id, fecha, bloque_id, hora, monto, motivo, registrado_por)
      VALUES
        (v_club, p_jugador_id, p_fecha, NULL,
         COALESCE(p_hora, (now() AT TIME ZONE 'America/Santiago')::time),
         p_monto, NULLIF(btrim(p_motivo), ''), auth.uid())
      RETURNING id INTO v_id;
    END IF;
  END IF;

  -- A propósito NO se llama a recalcular_sesiones: una clase extra no consume
  -- el plan. Ese es el punto de que viva fuera de `asistencia`.
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_clase_extraordinaria(uuid, date, uuid, time, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_clase_extraordinaria(uuid, date, uuid, time, integer, text) TO authenticated;

-- Poder cambiarle el grupo después, cuando se registró sin saberlo.
CREATE OR REPLACE FUNCTION public.asignar_bloque_clase_extraordinaria(
  p_id        uuid,
  p_bloque_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid; v_rol text; v_jugador uuid; v_fecha date; v_pagada timestamptz;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden cambiar el grupo';
  END IF;

  SELECT jugador_id, fecha, pagada_en INTO v_jugador, v_fecha, v_pagada
  FROM clases_extraordinarias WHERE id = p_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase extraordinaria no encontrada en el club'; END IF;
  IF v_pagada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa clase ya está pagada: hay que revertir el pago antes de cambiarla';
  END IF;

  IF p_bloque_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = p_bloque_id AND club_id = v_club) THEN
      RAISE EXCEPTION 'El bloque no es de este club';
    END IF;
    IF EXISTS (
      SELECT 1 FROM clases_extraordinarias
      WHERE jugador_id = v_jugador AND fecha = v_fecha AND bloque_id = p_bloque_id AND id <> p_id
    ) THEN
      RAISE EXCEPTION 'Ya hay una clase extra de ese jugador en ese grupo y esa fecha';
    END IF;
  END IF;

  UPDATE clases_extraordinarias SET bloque_id = p_bloque_id WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_bloque_clase_extraordinaria(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.asignar_bloque_clase_extraordinaria(uuid, uuid) TO authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- p_bloque_id ahora tiene valor por defecto, así que se puede llamar sin él.
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'asignar_bloque_clase_extraordinaria') AS funcion_nueva,
  (SELECT pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registrar_clase_extraordinaria')      AS argumentos_opcionales,
  (SELECT count(*) FROM clases_extraordinarias)                                       AS extras;
