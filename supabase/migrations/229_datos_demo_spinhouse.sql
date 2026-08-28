-- ────────────────────────────────────────────────────────────
-- DATOS DE DEMOSTRACIÓN para Spinhouse: un club entero, funcionando.
--
-- Este cambio afecta a: Spinhouse (2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41).
-- NO TOCA BUIN NI NINGÚN OTRO CLUB. Todo cuelga de `v_club`, y al principio
-- hay un guardia que aborta si ese id no es el de Spinhouse.
--
-- Para qué: las tres funciones nuevas (migraciones 226, 227 y 228) estaban
-- entregadas pero no se podían ver, porque el club tenía 0 bloques, 0
-- profesores y 0 inscripciones. Esto lo llena para poder recorrerlas.
--
-- Qué carga:
--   4 profesores · 2 grupos · 10 bloques (lun a vie, dos franjas)
--   50 jugadores con sus inscripciones
--   Toda la asistencia de agosto de 2026, hasta hoy
--   Asistencia de los profesores del mismo período  → migración 227
--   Cancelaciones y una recuperación                → migración 226
--   Feedback en las dos direcciones, con anónimos   → migración 228
--
-- SON DATOS FALSOS. Al final del archivo está el script de limpieza que los
-- borra todos sin tocar nada más. Correrlo antes de cargar los datos reales.
--
-- NOTA: usa la sede 'spinhouse', que existe desde la migración 232. Si se
-- vuelve a sembrar, hay que haber corrido la 232 antes o el CHECK lo rechaza.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('229_datos_demo_spinhouse');

DO $$
DECLARE
  v_club   uuid := '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
  v_hoy    date := (now() AT TIME ZONE 'America/Santiago')::date;
  -- El mes que pidió verse lleno. Se recorta a hoy: nadie asistió mañana.
  v_desde  date := date '2026-08-01';
  v_hasta  date;

  v_grupo_men uuid;
  v_grupo_adu uuid;

  v_prof_ids  uuid[];
  v_bloque_ids uuid[];

  r        record;
  v_fecha  date;
  v_id     uuid;
  v_n      int;
  v_estado text;
BEGIN
  -- ══ Guardias ═══════════════════════════════════════════════════════════
  -- El id está escrito arriba, pero un copiar/pegar descuidado a otro club
  -- sería catastrófico: esto carga 50 jugadores y un mes de asistencia.
  IF v_club <> '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' THEN
    RAISE EXCEPTION 'Este seed es solo para Spinhouse';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club AND nombre = 'Spinhouse') THEN
    RAISE EXCEPTION 'El club % no es Spinhouse. Abortado.', v_club;
  END IF;

  v_hasta := LEAST(date '2026-08-31', v_hoy);

  -- Determinista: dos corridas dan el mismo club, no uno distinto cada vez.
  PERFORM setseed(0.42);


  -- ══ 1. Profesores ══════════════════════════════════════════════════════
  -- Sin `email`: la ficha existe pero no tiene cuenta asociada. Alcanza para
  -- que el ADMIN les marque asistencia. Para que se marquen ellos mismos hay
  -- que darles acceso desde Configuración → Profesores, y ahí el correo de la
  -- cuenta tiene que quedar igual al de la ficha (ver migración 227).
  INSERT INTO profesores (club_id, nombre, especialidad, activo)
  SELECT v_club, n.nombre, n.esp, true
  FROM (VALUES
    ('Camila Reyes',     'Técnica y fundamentos'),
    ('Ignacio Fuentes',  'Alto rendimiento'),
    ('Paula Contreras',  'Iniciación y menores'),
    ('Sebastián Rojas',  'Preparación física')
  ) AS n(nombre, esp)
  WHERE NOT EXISTS (
    SELECT 1 FROM profesores p WHERE p.club_id = v_club AND lower(p.nombre) = lower(n.nombre)
  );

  SELECT array_agg(id ORDER BY nombre) INTO v_prof_ids
  FROM profesores WHERE club_id = v_club AND activo;


  -- ══ 2. Grupos y bloques ════════════════════════════════════════════════
  INSERT INTO grupos_entrenamiento (club_id, nombre, sede, activo)
  VALUES (v_club, 'Menores', 'spinhouse', true), (v_club, 'Adultos', 'spinhouse', true)
  ON CONFLICT (club_id, sede, nombre) DO NOTHING;

  SELECT id INTO v_grupo_men FROM grupos_entrenamiento
  WHERE club_id = v_club AND nombre = 'Menores' AND sede = 'spinhouse';
  SELECT id INTO v_grupo_adu FROM grupos_entrenamiento
  WHERE club_id = v_club AND nombre = 'Adultos' AND sede = 'spinhouse';

  -- Dos franjas por día, de lunes a viernes. La restricción
  -- UNIQUE (club_id, sede, dia_semana, hora_inicio) permite una por hora y día.
  INSERT INTO bloques_horario
    (club_id, grupo_id, nombre, sede, dia_semana, hora_inicio, hora_fin,
     cupo_maximo, cupo_libres, vigente_desde)
  SELECT v_club,
         CASE WHEN f.hora = '17:00' THEN v_grupo_men ELSE v_grupo_adu END,
         CASE WHEN f.hora = '17:00' THEN 'Menores ' ELSE 'Adultos ' END || d.etiqueta,
         'spinhouse', d.dia, f.hora::time, (f.hora::time + interval '90 minutes')::time,
         -- Menores 10, Adultos 18: con 8 para los dos, los de Adultos quedaban
         -- 5 a 8 personas sobre el cupo y la recuperación no tenía qué ofrecer.
         CASE WHEN f.hora = '17:00' THEN 10 ELSE 18 END, 2, v_desde
  FROM (VALUES ('lun','Lun'),('mar','Mar'),('mie','Mié'),('jue','Jue'),('vie','Vie')) AS d(dia, etiqueta)
  CROSS JOIN (VALUES ('17:00'), ('19:00')) AS f(hora)
  ON CONFLICT (club_id, sede, dia_semana, hora_inicio) DO NOTHING;

  SELECT array_agg(id ORDER BY dia_semana, hora_inicio) INTO v_bloque_ids
  FROM bloques_horario WHERE club_id = v_club;

  -- Un profesor a cada bloque, y un segundo profe en los de las 19:00. Ese
  -- caso —dos profes en el mismo bloque, cada uno marcando la suya— es
  -- justamente lo que pidió Spinhouse y conviene poder verlo.
  INSERT INTO bloque_profesores (bloque_id, profesor_id, vigente_desde)
  SELECT b.id,
         v_prof_ids[1 + (abs(hashtext(b.dia_semana)) % 2)],
         v_desde
  FROM bloques_horario b WHERE b.club_id = v_club
  ON CONFLICT DO NOTHING;

  INSERT INTO bloque_profesores (bloque_id, profesor_id, vigente_desde)
  SELECT b.id, v_prof_ids[3 + (abs(hashtext(b.dia_semana)) % 2)], v_desde
  FROM bloques_horario b
  WHERE b.club_id = v_club AND b.hora_inicio = '19:00'
  ON CONFLICT DO NOTHING;


  -- ══ 3. Cincuenta jugadores ═════════════════════════════════════════════
  INSERT INTO jugadores
    (club_id, nombre, categoria, estado, es_externo, mensualidad,
     tipo_plan, entrenamientos_por_semana, fecha_nacimiento, sede, telefono)
  SELECT
    v_club,
    n.nombre || ' ' || a.apellido,
    CASE WHEN i % 3 = 0 THEN 'Menores' ELSE 'Adultos' END,
    'activo', false,
    35000,
    -- 'mensual', no 'fijo': el CHECK de la migración 004 solo acepta
    -- 'mensual', 'semanal' o 'libre'.
    'mensual',
    CASE WHEN i % 4 = 0 THEN 3 ELSE 2 END,
    -- Los "Menores" nacen entre 2010 y 2015; el resto, entre 1985 y 2005.
    CASE WHEN i % 3 = 0
         THEN date '2010-01-01' + ((i * 37) % 2000)
         ELSE date '1985-01-01' + ((i * 211) % 7300) END,
    'spinhouse',
    '+5699' || lpad(((i * 7919) % 10000000)::text, 7, '0')
  FROM generate_series(1, 50) AS i
  CROSS JOIN LATERAL (
    SELECT (ARRAY['Matías','Valentina','Benjamín','Catalina','Vicente','Josefa',
                  'Martín','Isidora','Agustín','Antonia','Tomás','Florencia',
                  'Diego','Emilia','Joaquín','Amanda','Lucas','Trinidad',
                  'Gaspar','Renata','Bruno','Javiera','Nicolás','Fernanda',
                  'Cristóbal'])[1 + (i % 25)] AS nombre
  ) n
  CROSS JOIN LATERAL (
    SELECT (ARRAY['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras',
                  'Silva','Martínez','Sepúlveda','Morales','Rodríguez','López',
                  'Fuentes','Hernández','Torres','Araya','Flores','Espinoza',
                  'Valenzuela'])[1 + ((i * 3) % 20)] AS apellido
  ) a
  WHERE NOT EXISTS (
    SELECT 1 FROM jugadores j
    WHERE j.club_id = v_club AND j.nombre = n.nombre || ' ' || a.apellido
  );


  -- ══ 4. Inscripciones ═══════════════════════════════════════════════════
  -- Cada jugador va a dos o tres bloques del mismo horario (los menores a las
  -- 17:00, los adultos a las 19:00), en días distintos.
  FOR r IN
    SELECT j.id, j.categoria, j.entrenamientos_por_semana,
           row_number() OVER (ORDER BY j.nombre) AS n
    FROM jugadores j
    WHERE j.club_id = v_club AND j.estado = 'activo'
      AND COALESCE(j.es_externo, false) = false
  LOOP
    -- Reparte los días para que los bloques no queden todos llenos ni todos
    -- vacíos: cada jugador arranca en un día distinto según su número.
    INSERT INTO bloque_jugadores (bloque_id, jugador_id, vigente_desde)
    SELECT b.id, r.id, v_desde
    FROM generate_series(0, r.entrenamientos_por_semana - 1) AS s
    JOIN bloques_horario b
      ON b.club_id = v_club
     AND b.hora_inicio = CASE WHEN r.categoria = 'Menores' THEN time '17:00' ELSE time '19:00' END
     AND b.dia_semana = (ARRAY['lun','mar','mie','jue','vie'])[1 + ((r.n::int + s) % 5)]
    ON CONFLICT DO NOTHING;
  END LOOP;


  -- ══ 5. La asistencia de agosto ═════════════════════════════════════════
  -- Una fila por jugador y día en que le tocaba entrenar. `asistencia` tiene
  -- UNIQUE (jugador_id, fecha), así que quien va a dos bloques el mismo día
  -- deja una sola marca: es correcto, asistió una vez ese día.
  FOR v_fecha IN
    SELECT d::date FROM generate_series(v_desde, v_hasta, interval '1 day') d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  LOOP
    INSERT INTO asistencia (jugador_id, club_id, fecha, hora, metodo, estado, bloque_id)
    SELECT DISTINCT ON (bj.jugador_id)
           bj.jugador_id, v_club, v_fecha,
           (b.hora_inicio + (interval '1 minute' * floor(random() * 12)))::time,
           'manual',
           -- ~85% presente. El resto ausente, que es lo que hace que los
           -- porcentajes y el panorama muestren algo real.
           CASE WHEN random() < 0.85 THEN 'presente' ELSE 'ausente' END,
           b.id
    FROM bloque_jugadores bj
    JOIN bloques_horario b ON b.id = bj.bloque_id
    WHERE b.club_id = v_club
      AND b.dia_semana = (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[EXTRACT(DOW FROM v_fecha)::int + 1]
      AND bj.vigente_desde <= v_fecha
      AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= v_fecha)
    ORDER BY bj.jugador_id, b.hora_inicio
    ON CONFLICT (jugador_id, fecha) DO NOTHING;
  END LOOP;


  -- ══ 6. Asistencia de los profesores (migración 227) ════════════════════
  -- ~92%: el profe falta menos que el alumno, pero falta. Esa diferencia entre
  -- las horas que le tocaban y las que marcó es justo lo que el club quiere ver.
  FOR v_fecha IN
    SELECT d::date FROM generate_series(v_desde, v_hasta, interval '1 day') d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  LOOP
    INSERT INTO asistencia_profesores (club_id, profesor_id, bloque_id, fecha, hora)
    SELECT v_club, bp.profesor_id, b.id, v_fecha,
           (b.hora_inicio - interval '10 minutes')::time
    FROM bloque_profesores bp
    JOIN bloques_horario b ON b.id = bp.bloque_id
    WHERE b.club_id = v_club
      AND b.dia_semana = (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[EXTRACT(DOW FROM v_fecha)::int + 1]
      AND bp.vigente_hasta IS NULL
      AND random() < 0.92
    ON CONFLICT (profesor_id, bloque_id, fecha) DO NOTHING;
  END LOOP;


  -- ══ 7. Cancelaciones y recuperaciones (migración 226) ═══════════════════
  -- Avisos repartidos por el mes, la mayoría con derecho a recuperar.
  INSERT INTO bloque_cupos_dia (club_id, bloque_id, jugador_id, fecha, tipo, con_derecho, motivo)
  SELECT v_club, x.bloque_id, x.jugador_id, f.fecha, 'libera',
         x.n % 4 <> 0,   -- tres de cada cuatro avisaron a tiempo
         (ARRAY['Tengo prueba al día siguiente.',
                'Me surgió un tema familiar.',
                'Estoy resfriado.',
                'Tengo hora al médico.',
                'Viaje por trabajo.'])[1 + (x.n % 5)]
  FROM (
    SELECT bj.bloque_id, bj.jugador_id, b.dia_semana,
           row_number() OVER (ORDER BY bj.jugador_id, b.id) AS n
    FROM bloque_jugadores bj
    JOIN bloques_horario b ON b.id = bj.bloque_id
    WHERE b.club_id = v_club AND bj.vigente_hasta IS NULL
    ORDER BY random()
    LIMIT 18
  ) x
  CROSS JOIN LATERAL (
    -- Una fecha del mes que caiga en el día de la semana de ese bloque.
    SELECT d::date AS fecha
    FROM generate_series(v_desde, LEAST(v_hasta + 7, date '2026-09-04'), interval '1 day') d
    WHERE (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[EXTRACT(DOW FROM d)::int + 1] = x.dia_semana
    ORDER BY random() LIMIT 1
  ) f(fecha)
  ON CONFLICT (bloque_id, jugador_id, fecha) DO NOTHING;

  -- Dos recuperaciones ya asignadas, para que la vista del profe no esté vacía.
  FOR r IN
    SELECT m.jugador_id, m.fecha
    FROM bloque_cupos_dia m
    WHERE m.club_id = v_club AND m.tipo = 'libera' AND m.con_derecho
    ORDER BY random() LIMIT 2
  LOOP
    SELECT b.id INTO v_id
    FROM bloques_horario b
    WHERE b.club_id = v_club
      AND b.dia_semana = (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[EXTRACT(DOW FROM r.fecha)::int + 1]
      AND NOT EXISTS (
        SELECT 1 FROM bloque_jugadores bj
        WHERE bj.bloque_id = b.id AND bj.jugador_id = r.jugador_id AND bj.vigente_hasta IS NULL
      )
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      INSERT INTO bloque_cupos_dia (club_id, bloque_id, jugador_id, fecha, tipo)
      VALUES (v_club, v_id, r.jugador_id, r.fecha, 'toma')
      ON CONFLICT (bloque_id, jugador_id, fecha) DO NOTHING;
    END IF;
  END LOOP;


  -- ══ 8. Feedback en las dos direcciones (migración 228) ══════════════════
  -- Del profe al alumno (esto ya existía, migración 120).
  INSERT INTO feedback_jugadores (club_id, jugador_id, autor_id, autor_nombre, fecha, comentario)
  SELECT v_club, j.id, NULL, 'Camila Reyes',
         v_desde + ((abs(hashtext(j.id::text)) % 20)),
         (ARRAY['Muy buena semana, se le nota el trabajo de revés.',
                'Mejoró bastante el saque. Seguir puliendo el control.',
                'Le cuesta mantener la posición. Vamos a trabajarlo.',
                'Excelente actitud en los entrenamientos.',
                'Necesita más constancia en la asistencia.'])[1 + (abs(hashtext(j.id::text)) % 5)]
  FROM jugadores j
  WHERE j.club_id = v_club AND j.estado = 'activo'
  ORDER BY random() LIMIT 15;

  -- Del alumno al profe: la mitad anónimos, que es el caso que hay que poder ver.
  INSERT INTO feedback_profesores (club_id, profesor_id, jugador_id, anonimo, comentario, fecha)
  SELECT v_club,
         bp.profesor_id,
         x.jugador_id,
         (x.n % 2 = 0),
         (ARRAY['Me gustan mucho las clases, aprendí harto este mes.',
                'Me gustaría que trabajáramos más el juego de piernas.',
                'A veces el grupo es muy grande y cuesta que nos vea a todos.',
                'Excelente profe, muy claro para explicar.',
                'Estaría bueno que hiciéramos más partidos de práctica.',
                'Las clases empiezan un poco tarde a veces.'])[1 + (x.n % 6)],
         -- ::int porque row_number() devuelve bigint y no existe date + bigint.
         v_desde + ((x.n * 3) % 24)::int
  FROM (
    SELECT bj.bloque_id, bj.jugador_id, row_number() OVER (ORDER BY random()) AS n
    FROM bloque_jugadores bj
    JOIN bloques_horario b ON b.id = bj.bloque_id
    WHERE b.club_id = v_club AND bj.vigente_hasta IS NULL
    ORDER BY random() LIMIT 20
  ) x
  -- Un solo profesor por comentario: los bloques de las 19:00 tienen dos, y sin
  -- el LATERAL con LIMIT 1 el alumno le escribiría lo mismo a los dos.
  CROSS JOIN LATERAL (
    SELECT bp.profesor_id FROM bloque_profesores bp
    WHERE bp.bloque_id = x.bloque_id AND bp.vigente_hasta IS NULL
    ORDER BY random() LIMIT 1
  ) bp
  ON CONFLICT (jugador_id, profesor_id, fecha) DO NOTHING;


  -- ══ Resumen ════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM jugadores WHERE club_id = v_club;
  RAISE NOTICE 'Spinhouse listo: % jugadores, % bloques, % profesores, % asistencias, % avisos, % feedbacks al profe',
    v_n,
    (SELECT count(*) FROM bloques_horario WHERE club_id = v_club),
    (SELECT count(*) FROM profesores WHERE club_id = v_club),
    (SELECT count(*) FROM asistencia WHERE club_id = v_club),
    (SELECT count(*) FROM bloque_cupos_dia WHERE club_id = v_club),
    (SELECT count(*) FROM feedback_profesores WHERE club_id = v_club);
END $$;

COMMIT;


-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (correr aparte, después del COMMIT)
-- ══════════════════════════════════════════════════════════════════════════
--
-- SELECT
--   (SELECT count(*) FROM profesores            WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS profesores,
--   (SELECT count(*) FROM bloques_horario       WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS bloques,
--   (SELECT count(*) FROM jugadores             WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS jugadores,
--   (SELECT count(*) FROM asistencia            WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS asistencias,
--   (SELECT count(*) FROM asistencia_profesores WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS asist_profes,
--   (SELECT count(*) FROM bloque_cupos_dia      WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS avisos,
--   (SELECT count(*) FROM feedback_profesores   WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') AS fb_al_profe;
--
-- Y que BUIN no se movió (tiene que dar 0):
-- SELECT count(*) FROM bloque_cupos_dia WHERE club_id <> '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';


-- ══════════════════════════════════════════════════════════════════════════
-- LIMPIEZA — correr ANTES de cargar los datos reales de Spinhouse.
-- ══════════════════════════════════════════════════════════════════════════
-- Borra TODO lo de este archivo y nada más: cada DELETE filtra por el club de
-- Spinhouse. Pegar entero, de una vez.
--
-- BEGIN;
-- DO $limpieza$
-- DECLARE v_club uuid := '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club AND nombre = 'Spinhouse') THEN
--     RAISE EXCEPTION 'Ese club no es Spinhouse. Abortado.';
--   END IF;
--
--   DELETE FROM feedback_profesores   WHERE club_id = v_club;
--   DELETE FROM feedback_jugadores    WHERE club_id = v_club;
--   DELETE FROM bloque_cupos_dia      WHERE club_id = v_club;
--   DELETE FROM asistencia_profesores WHERE club_id = v_club;
--   DELETE FROM asistencia            WHERE club_id = v_club;
--   DELETE FROM bloque_jugadores      WHERE bloque_id IN (SELECT id FROM bloques_horario WHERE club_id = v_club);
--   DELETE FROM bloque_profesores     WHERE bloque_id IN (SELECT id FROM bloques_horario WHERE club_id = v_club);
--   DELETE FROM bloques_horario       WHERE club_id = v_club;
--   DELETE FROM grupos_entrenamiento  WHERE club_id = v_club;
--   DELETE FROM profesores            WHERE club_id = v_club;
--
--   -- Los dos jugadores demo del piloto técnico (migraciones 165 y 169) NO se
--   -- borran: tienen sesiones y evaluaciones colgando, y no los creó este seed.
--   DELETE FROM jugadores WHERE club_id = v_club
--     AND id NOT IN ('7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
--                    '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19');
--
--   -- Y se libera el portazo, por si se quiere volver a sembrar.
--   DELETE FROM _migraciones_aplicadas WHERE nombre = '229_datos_demo_spinhouse';
-- END $limpieza$;
-- COMMIT;
