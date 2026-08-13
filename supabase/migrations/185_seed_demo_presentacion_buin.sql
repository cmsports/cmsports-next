-- Datos de demostración para "Demo Presentación Buin".
-- 3 feedbacks, asistencias de días previos y 3 mensualidades pagadas.
-- Solo ese jugador, solo Buin. Pegar una vez en el SQL Editor.
-- Si se pega de nuevo, el portazo aborta y no duplica plata ni asistencias.

BEGIN;
SELECT _migracion_nueva('185_seed_demo_presentacion_buin');

DO $$
DECLARE
  v_club    uuid := 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
  v_jugador uuid;
  v_nombre  text;
  v_monto   integer;
  v_profe   text;
  v_hoy     date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_ayer    date;
  v_desde   date := DATE '2026-07-20';
  v_fecha   date;
  v_hora    time;
  v_dows    int[];
  v_n       integer;
  v_mes     integer;
  v_anio    integer;
  v_pago    date;
  v_metodo  text;
  v_men_id  uuid;
  v_mov_id  uuid;
  v_meses   text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  v_ayer := v_hoy - 1;

  SELECT count(*) INTO v_n
  FROM public.jugadores j
  WHERE j.club_id = v_club
    AND COALESCE(j.es_externo, false) = false
    AND (
      lower(COALESCE(j.email, '')) = 'demo.buin@cmsports.cl'
      OR regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = '888888888'
      OR j.nombre ILIKE 'Demo Presentación%'
    );
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No está el jugador Demo Presentación Buin. Crealo primero en Jugadores.';
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'Hay más de un jugador que coincide con la demo. No se toca nada.';
  END IF;

  SELECT j.id, j.nombre,
         COALESCE(NULLIF(j.mensualidad, 0), (SELECT mensualidad_base FROM public.clubes WHERE id = v_club), 25000)
    INTO v_jugador, v_nombre, v_monto
  FROM public.jugadores j
  WHERE j.club_id = v_club
    AND COALESCE(j.es_externo, false) = false
    AND (
      lower(COALESCE(j.email, '')) = 'demo.buin@cmsports.cl'
      OR regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = '888888888'
      OR j.nombre ILIKE 'Demo Presentación%'
    );

  SELECT COALESCE(
    (SELECT p.nombre FROM public.profesores p
      WHERE p.club_id = v_club AND COALESCE(p.activo, true) = true
      ORDER BY p.nombre LIMIT 1),
    (SELECT pf.nombre FROM public.perfiles pf
      WHERE pf.club_id = v_club AND pf.rol IN ('profesor', 'admin')
      ORDER BY CASE pf.rol WHEN 'profesor' THEN 0 ELSE 1 END, pf.nombre
      LIMIT 1),
    'Profesor'
  ) INTO v_profe;

  -- Si no tiene horario, lo anoto en lun/mié/vie de Buin para que Mi horario se vea.
  IF NOT EXISTS (
    SELECT 1 FROM public.bloque_jugadores bj
    WHERE bj.jugador_id = v_jugador AND bj.vigente_hasta IS NULL
  ) THEN
    INSERT INTO public.bloque_jugadores (bloque_id, jugador_id, vigente_desde)
    SELECT DISTINCT ON (b.dia_semana) b.id, v_jugador, v_desde
    FROM public.bloques_horario b
    WHERE b.club_id = v_club
      AND b.dia_semana IN ('lun', 'mie', 'vie')
      AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= v_hoy)
      AND COALESCE(b.activo, true) = true
    ORDER BY b.dia_semana, b.hora_inicio;
  END IF;

  -- La inscripción de hoy no cubre julio: sin esto el calendario marca esas
  -- asistencias como visita, no como clase propia.
  UPDATE public.bloque_jugadores
  SET vigente_desde = v_desde
  WHERE jugador_id = v_jugador
    AND vigente_hasta IS NULL
    AND vigente_desde > v_desde;

  SELECT COALESCE(array_agg(DISTINCT
    CASE b.dia_semana
      WHEN 'lun' THEN 1 WHEN 'mar' THEN 2 WHEN 'mie' THEN 3
      WHEN 'jue' THEN 4 WHEN 'vie' THEN 5
    END
  ), ARRAY[1, 3, 5])
  INTO v_dows
  FROM public.bloque_jugadores bj
  JOIN public.bloques_horario b ON b.id = bj.bloque_id
  WHERE bj.jugador_id = v_jugador
    AND bj.vigente_hasta IS NULL
    AND b.dia_semana IN ('lun', 'mar', 'mie', 'jue', 'vie');

  -- Asistencias de los días que le tocan, desde el 20 de julio hasta ayer.
  -- Hoy no: así en la reunión se puede pasar lista en vivo.
  FOR v_fecha IN
    SELECT d::date
    FROM generate_series(v_desde, v_ayer, interval '1 day') d
    WHERE extract(isodow FROM d)::int = ANY (v_dows)
  LOOP
    SELECT MIN(b.hora_inicio) INTO v_hora
    FROM public.bloque_jugadores bj
    JOIN public.bloques_horario b ON b.id = bj.bloque_id
    WHERE bj.jugador_id = v_jugador
      AND bj.vigente_hasta IS NULL
      AND b.dia_semana = (ARRAY['lun','mar','mie','jue','vie'])[extract(isodow FROM v_fecha)::int];
    v_hora := COALESCE(v_hora, TIME '18:30');

    INSERT INTO public.asistencia (club_id, jugador_id, fecha, hora, estado, metodo)
    VALUES (v_club, v_jugador, v_fecha, v_hora, 'presente', 'manual')
    ON CONFLICT (jugador_id, fecha) DO NOTHING;
  END LOOP;

  PERFORM public.recalcular_sesiones(v_jugador);

  IF NOT EXISTS (
    SELECT 1 FROM public.feedback_jugadores WHERE jugador_id = v_jugador AND club_id = v_club
  ) THEN
    INSERT INTO public.feedback_jugadores
      (club_id, jugador_id, autor_id, autor_nombre, fecha, hora, comentario)
    VALUES
      (v_club, v_jugador, NULL, v_profe, DATE '2026-07-29', TIME '18:45',
       'Buen trabajo en el servicio. Mantuvo la concentración toda la clase. Seguir insistiendo en el primer rebote.'),
      (v_club, v_jugador, NULL, v_profe, DATE '2026-08-05', TIME '19:10',
       'Mejoró el revés. Hay que cuidar el pie de apoyo al girar; cuando lo hace bien, el golpe sale pesado.'),
      (v_club, v_jugador, NULL, v_profe, DATE '2026-08-12', TIME '18:50',
       'Hoy se notó más agresivo en la mesa y pidió los puntos. Así de cara al ranking interno.');
  END IF;

  -- Tres meses pagados, cada uno en su fecha. No se usa el RPC de cobro:
  -- ese pone fecha de hoy y los tres quedarían el mismo día.
  FOR v_mes, v_anio, v_pago, v_metodo IN
    SELECT mes, anio, pago, metodo
    FROM (VALUES
      (6, 2026, DATE '2026-06-05', 'transferencia'),
      (7, 2026, DATE '2026-07-03', 'efectivo'),
      (8, 2026, DATE '2026-08-04', 'transferencia')
    ) AS t(mes, anio, pago, metodo)
  LOOP
    v_men_id := NULL;
    INSERT INTO public.mensualidades (
      club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo, notas
    ) VALUES (
      v_club, v_jugador, v_mes, v_anio, v_monto, 'pagado', v_pago, v_metodo,
      'Seed demo presentación'
    )
    ON CONFLICT (jugador_id, mes, anio) DO UPDATE
      SET estado = 'pagado',
          monto = EXCLUDED.monto,
          fecha_pago = EXCLUDED.fecha_pago,
          metodo = EXCLUDED.metodo,
          notas = EXCLUDED.notas
      WHERE mensualidades.estado IS DISTINCT FROM 'pagado';

    SELECT id INTO v_men_id
    FROM public.mensualidades
    WHERE jugador_id = v_jugador AND mes = v_mes AND anio = v_anio;

    IF v_men_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.movimientos
      WHERE club_id = v_club AND mensualidad_id = v_men_id AND categoria = 'mensualidad'
    ) THEN
      INSERT INTO public.movimientos (
        club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
        mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id
      ) VALUES (
        v_club, 'ingreso', 'mensualidad',
        'Mensualidad ' || v_nombre || ' — ' || v_meses[v_mes] || ' ' || v_anio,
        v_monto, v_pago, v_jugador, v_mes, v_anio, 'Seed demo presentación', v_men_id
      ) RETURNING id INTO v_mov_id;

      INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
      VALUES (
        v_club, 'mensualidades', v_men_id, 'pagar',
        jsonb_build_object('monto', v_monto, 'metodo', v_metodo, 'movimiento_id', v_mov_id, 'seed', 'demo_presentacion'),
        NULL
      );
    END IF;
  END LOOP;
END $$;

-- Verificación: tiene que devolver 1 fila, con feedbacks=3 y pagos=3.
SELECT
  j.nombre,
  (SELECT count(*) FROM feedback_jugadores f WHERE f.jugador_id = j.id) AS feedbacks,
  (SELECT count(*) FROM asistencia a WHERE a.jugador_id = j.id AND a.estado = 'presente') AS asistencias,
  (SELECT count(*) FROM mensualidades m WHERE m.jugador_id = j.id AND m.estado = 'pagado') AS pagos
FROM jugadores j
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    lower(COALESCE(j.email, '')) = 'demo.buin@cmsports.cl'
    OR j.nombre ILIKE 'Demo Presentación%'
  );

COMMIT;
