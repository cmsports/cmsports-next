-- Arregla el registro de asistencia, que quedó roto en la 087.
--
-- Ahí agregué `registrado_por` a las dos funciones que insertan asistencia,
-- suponiendo que apuntaba a auth.users. No apunta: su clave foránea rechaza
-- tanto el id de un usuario autenticado como el de un perfil o un jugador.
-- De las 476 asistencias que hay en la base, ninguna tiene ese campo lleno.
--
-- El efecto era que toda inserción fallaba con
--   "violates foreign key constraint asistencia_registrado_por_fkey"
-- y eso alcanzaba a pasar lista, al autorregistro del alumno y a la corrección
-- desde Asistencia Histórica.
--
-- La columna se deja de usar. Quién hizo cada cosa ya queda en
-- `auditoria_asistencia`, que es donde corresponde y donde además se guarda el
-- valor anterior, el nuevo y el motivo.
--
-- De paso: el guardia de rol no se disparaba cuando el rol venía en NULL,
-- porque en SQL `NULL NOT IN (...)` no es verdadero. Ahora se comprueba aparte.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_manual(
  p_jugador_id uuid,
  p_fecha      date,
  p_estado     text,
  p_motivo     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club     uuid;
  v_rol      text;
  v_anterior text;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();

  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden corregir la asistencia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF p_estado NOT IN ('presente', 'ausente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT estado INTO v_anterior FROM asistencia
  WHERE jugador_id = p_jugador_id AND fecha = p_fecha;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = p_fecha;
  ELSE
    INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, metodo)
    VALUES (v_club, p_jugador_id, p_fecha, localtime, p_estado, 'manual')
    ON CONFLICT (jugador_id, fecha) DO UPDATE SET estado = EXCLUDED.estado;
  END IF;

  IF v_anterior IS DISTINCT FROM NULLIF(p_estado, 'sin_registro') THEN
    INSERT INTO auditoria_asistencia
      (club_id, jugador_id, fecha, estado_anterior, estado_nuevo, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_fecha, v_anterior, NULLIF(p_estado, 'sin_registro'), p_motivo, auth.uid());
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_segura(
  p_jugador_id uuid,
  p_fecha      date DEFAULT NULL,
  p_hora       time DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club  uuid;
  v_fecha date;
  v_hora  time;
  v_id    uuid;
BEGIN
  SELECT club_id INTO v_club FROM jugadores WHERE id = p_jugador_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;

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
