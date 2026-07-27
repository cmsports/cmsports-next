-- Dos arreglos salidos de la auditoría del 28 de julio.
--
-- 1. `corregir_mensualidad` tenía el mismo guardia de rol defectuoso que ya se
--    arregló en asistencia: `IF v_rol NOT IN ('admin', 'superadmin')` no se
--    dispara cuando el rol viene en NULL, porque en SQL `NULL NOT IN (...)` no
--    es verdadero sino nulo. Un perfil sin rol se saltaba la comprobación y
--    seguía de largo hasta fallar más adelante por otra razón.
--
-- 2. `clases.dia_semana` exige el nombre largo —'lunes', 'martes'— y el horario
--    semanal trabaja con el corto —'lun', 'mar'—. Generar la semana insertaba
--    el corto y fallaba en cada fila contra `clases_dia_semana_check`. La
--    conversión se hace ahora en el código; acá solo queda anotado, porque la
--    restricción es correcta y son las 122 clases existentes las que fijan el
--    formato.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.corregir_mensualidad(
  p_jugador_id uuid,
  p_mes        integer,
  p_anio       integer,
  p_estado     text,
  p_monto      numeric DEFAULT NULL,
  p_fecha_pago date    DEFAULT NULL,
  p_metodo     text    DEFAULT NULL,
  p_motivo     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club      uuid;
  v_rol       text;
  v_nombre    text;
  v_jugador   text;
  v_id        uuid;
  v_estado_a  text;
  v_monto_a   numeric;
  v_fecha_a   date;
  v_aporte_a  numeric;
  v_aporte_n  numeric;
  v_ajuste    numeric;
BEGIN
  SELECT p.club_id, p.rol, p.nombre INTO v_club, v_rol, v_nombre
  FROM perfiles p WHERE p.id = auth.uid();

  -- El IS NULL va aparte: sin él, un perfil sin rol se salta el guardia.
  IF v_club IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el administrador puede corregir mensualidades';
  END IF;

  SELECT j.nombre INTO v_jugador FROM jugadores j
  WHERE j.id = p_jugador_id AND j.club_id = v_club;
  IF v_jugador IS NULL THEN RAISE EXCEPTION 'El jugador no es de este club'; END IF;

  IF p_mes NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes inválido: %', p_mes; END IF;
  IF p_estado NOT IN ('pagado', 'pendiente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT m.id, m.estado, m.monto, m.fecha_pago
    INTO v_id, v_estado_a, v_monto_a, v_fecha_a
  FROM mensualidades m
  WHERE m.jugador_id = p_jugador_id AND m.mes = p_mes AND m.anio = p_anio;

  v_aporte_a := CASE WHEN v_estado_a = 'pagado' THEN COALESCE(v_monto_a, 0) ELSE 0 END;
  v_aporte_n := CASE WHEN p_estado  = 'pagado' THEN COALESCE(p_monto, v_monto_a, 0) ELSE 0 END;
  v_ajuste   := v_aporte_n - v_aporte_a;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM mensualidades WHERE id = v_id;
  ELSIF v_id IS NULL THEN
    INSERT INTO mensualidades (club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo)
    VALUES (v_club, p_jugador_id, p_mes, p_anio, p_monto, p_estado,
            CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, current_date) END, p_metodo)
    RETURNING id INTO v_id;
  ELSE
    UPDATE mensualidades SET
      estado     = p_estado,
      monto      = COALESCE(p_monto, monto),
      fecha_pago = CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, fecha_pago, current_date) ELSE NULL END,
      metodo     = COALESCE(p_metodo, metodo)
    WHERE id = v_id;
  END IF;

  IF v_estado_a IS DISTINCT FROM NULLIF(p_estado, 'sin_registro')
     OR COALESCE(p_monto, v_monto_a) IS DISTINCT FROM v_monto_a
     OR (p_fecha_pago IS NOT NULL AND p_fecha_pago IS DISTINCT FROM v_fecha_a) THEN

    INSERT INTO auditoria_mensualidades
      (club_id, jugador_id, mes, anio, estado_anterior, estado_nuevo,
       monto_anterior, monto_nuevo, fecha_anterior, fecha_nueva, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_mes, p_anio, v_estado_a, NULLIF(p_estado, 'sin_registro'),
       v_monto_a, CASE WHEN p_estado = 'sin_registro' THEN NULL ELSE COALESCE(p_monto, v_monto_a) END,
       v_fecha_a, p_fecha_pago, p_motivo, auth.uid());
  END IF;

  IF v_ajuste <> 0 THEN
    INSERT INTO movimientos
      (club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
       mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id)
    VALUES
      (v_club,
       CASE WHEN v_ajuste > 0 THEN 'ingreso' ELSE 'egreso' END,
       'ajuste_mensualidad',
       'Ajuste de mensualidad · ' || v_jugador || ' · ' ||
         to_char(make_date(p_anio, p_mes, 1), 'TMMonth YYYY') ||
         COALESCE(' · ' || p_motivo, ''),
       abs(v_ajuste),
       current_date, p_jugador_id, p_mes, p_anio, v_nombre, v_id);
  END IF;
END;
$$;

COMMIT;
