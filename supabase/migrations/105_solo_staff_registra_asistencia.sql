-- Solo el entrenador o el administrador registran asistencia.
--
-- Decisión del profe: ni el jugador adulto ni el menor tienen derecho a pasar
-- su propia asistencia. Antes podían, desde /perfil y desde /asistencia.
--
-- El guardia tiene que estar acá, no en el código. `registrar_asistencia_segura`
-- es SECURITY DEFINER y está otorgada a `authenticated`, pero no comprobaba
-- quién llamaba: solo que el jugador existiera. Toda la validación de rol vivía
-- en TypeScript, así que cualquier jugador con la consola del navegador abierta
-- podía marcarse asistencia de cualquier fecha —y peor, marcar a jugadores de
-- otros clubes— saltándose la pantalla por completo. Quitar el botón no cerraba
-- nada. Esto sí.
--
-- Se copia el guardia que `registrar_asistencia_manual` ya tenía desde la 092,
-- incluida su lección: en SQL `NULL NOT IN (...)` no es verdadero, así que el
-- rol nulo se comprueba aparte o el guardia no se dispara.
--
-- El kiosco por RUT no se toca: es otra función (`registrar_asistencia_rut`),
-- la opera el club en su propia tablet con un token que el admin puede revocar,
-- y ahí hay un adulto presente.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_segura(
  p_jugador_id uuid,
  p_fecha      date DEFAULT NULL,
  p_hora       time DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santiago')::date);
  v_hora  := COALESCE(p_hora,  (now() AT TIME ZONE 'America/Santiago')::time);

  INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado)
  VALUES (v_club, p_jugador_id, v_fecha, v_hora, 'presente')
  ON CONFLICT (jugador_id, fecha) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = v_fecha;
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
  RETURN v_id;
END;
$$;

COMMIT;
