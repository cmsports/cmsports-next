-- Datos de demostración para "Demo Presentación Buin".
-- SIN DO $$: el SQL Editor de Supabase corta el string y mete RLS en el medio.
-- Pegar entero, una vez. Solo ese jugador, solo Buin.

BEGIN;
SELECT _migracion_nueva('185_seed_demo_presentacion_buin');

DROP TABLE IF EXISTS _seed_demo_presentacion_185;
CREATE TABLE _seed_demo_presentacion_185 AS
SELECT
  j.id AS jugador_id,
  j.nombre,
  COALESCE(NULLIF(j.mensualidad, 0), c.mensualidad_base, 25000)::int AS monto,
  COALESCE(
    (SELECT p.nombre FROM profesores p
      WHERE p.club_id = j.club_id AND COALESCE(p.activo, true) = true
      ORDER BY p.nombre LIMIT 1),
    (SELECT pf.nombre FROM perfiles pf
      WHERE pf.club_id = j.club_id AND pf.rol IN ('profesor', 'admin')
      ORDER BY CASE pf.rol WHEN 'profesor' THEN 0 ELSE 1 END, pf.nombre
      LIMIT 1),
    'Profesor'
  ) AS profe
FROM jugadores j
JOIN clubes c ON c.id = j.club_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND COALESCE(j.es_externo, false) = false
  AND (
    lower(COALESCE(j.email, '')) = 'demo.buin@cmsports.cl'
    OR regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = '888888888'
    OR j.nombre ILIKE 'Demo Presentación%'
  );

ALTER TABLE _seed_demo_presentacion_185 ENABLE ROW LEVEL SECURITY;

-- Falla acá si no hay exactamente 1 jugador demo (evita DO $$ y funciones).
SELECT 1 / CASE WHEN cnt = 1 THEN 1 ELSE 0 END
FROM (SELECT count(*) AS cnt FROM _seed_demo_presentacion_185) t;

-- Horario lun/mié/vie si todavía no tiene bloques.
INSERT INTO bloque_jugadores (bloque_id, jugador_id, vigente_desde)
SELECT DISTINCT ON (b.dia_semana) b.id, s.jugador_id, DATE '2026-07-20'
FROM _seed_demo_presentacion_185 s
JOIN bloques_horario b ON b.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
WHERE b.dia_semana IN ('lun', 'mie', 'vie')
  AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= (now() AT TIME ZONE 'America/Santiago')::date)
  AND COALESCE(b.activo, true) = true
  AND NOT EXISTS (
    SELECT 1 FROM bloque_jugadores bj
    WHERE bj.jugador_id = s.jugador_id AND bj.vigente_hasta IS NULL
  )
ORDER BY b.dia_semana, b.hora_inicio;

UPDATE bloque_jugadores bj
SET vigente_desde = DATE '2026-07-20'
FROM _seed_demo_presentacion_185 s
WHERE bj.jugador_id = s.jugador_id
  AND bj.vigente_hasta IS NULL
  AND bj.vigente_desde > DATE '2026-07-20';

-- Asistencias desde el 20 de julio hasta ayer (hoy no, para pasar lista en vivo).
INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, metodo)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid,
  s.jugador_id,
  d::date,
  COALESCE((
    SELECT MIN(b.hora_inicio)
    FROM bloque_jugadores bj
    JOIN bloques_horario b ON b.id = bj.bloque_id
    WHERE bj.jugador_id = s.jugador_id
      AND bj.vigente_hasta IS NULL
      AND b.dia_semana = (ARRAY['lun','mar','mie','jue','vie'])[extract(isodow FROM d)::int]
  ), TIME '18:30'),
  'presente',
  'manual'
FROM _seed_demo_presentacion_185 s
CROSS JOIN generate_series(
  DATE '2026-07-20',
  ((now() AT TIME ZONE 'America/Santiago')::date - 1),
  interval '1 day'
) AS d
WHERE extract(isodow FROM d)::int IN (
  SELECT CASE b.dia_semana
    WHEN 'lun' THEN 1 WHEN 'mar' THEN 2 WHEN 'mie' THEN 3
    WHEN 'jue' THEN 4 WHEN 'vie' THEN 5
  END
  FROM bloque_jugadores bj
  JOIN bloques_horario b ON b.id = bj.bloque_id
  WHERE bj.jugador_id = s.jugador_id
    AND bj.vigente_hasta IS NULL
    AND b.dia_semana IN ('lun', 'mar', 'mie', 'jue', 'vie')
  UNION
  SELECT unnest(ARRAY[1, 3, 5])
  WHERE NOT EXISTS (
    SELECT 1 FROM bloque_jugadores bj2
    WHERE bj2.jugador_id = s.jugador_id AND bj2.vigente_hasta IS NULL
  )
)
ON CONFLICT (jugador_id, fecha) DO NOTHING;

SELECT public.recalcular_sesiones(s.jugador_id)
FROM _seed_demo_presentacion_185 s;

INSERT INTO feedback_jugadores
  (club_id, jugador_id, autor_id, autor_nombre, fecha, hora, comentario)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid,
  s.jugador_id,
  NULL,
  s.profe,
  f.fecha,
  f.hora,
  f.comentario
FROM _seed_demo_presentacion_185 s
CROSS JOIN (VALUES
  (DATE '2026-07-29', TIME '18:45', 'Buen trabajo en el servicio. Mantuvo la concentración toda la clase. Seguir insistiendo en el primer rebote.'),
  (DATE '2026-08-05', TIME '19:10', 'Mejoró el revés. Hay que cuidar el pie de apoyo al girar; cuando lo hace bien, el golpe sale pesado.'),
  (DATE '2026-08-12', TIME '18:50', 'Hoy se notó más agresivo en la mesa y pidió los puntos. Así de cara al ranking interno.')
) AS f(fecha, hora, comentario)
WHERE NOT EXISTS (
  SELECT 1 FROM feedback_jugadores x
  WHERE x.jugador_id = s.jugador_id
    AND x.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
);

INSERT INTO mensualidades (
  club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo, notas
)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid,
  s.jugador_id,
  p.mes,
  p.anio,
  s.monto,
  'pagado',
  p.pago,
  p.metodo,
  'Seed demo presentación'
FROM _seed_demo_presentacion_185 s
CROSS JOIN (VALUES
  (6, 2026, DATE '2026-06-05', 'transferencia'),
  (7, 2026, DATE '2026-07-03', 'efectivo'),
  (8, 2026, DATE '2026-08-04', 'transferencia')
) AS p(mes, anio, pago, metodo)
ON CONFLICT (jugador_id, mes, anio) DO UPDATE
  SET estado = 'pagado',
      monto = EXCLUDED.monto,
      fecha_pago = EXCLUDED.fecha_pago,
      metodo = EXCLUDED.metodo,
      notas = EXCLUDED.notas
  WHERE mensualidades.estado IS DISTINCT FROM 'pagado';

INSERT INTO movimientos (
  club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
  mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id
)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid,
  'ingreso',
  'mensualidad',
  'Mensualidad ' || s.nombre || ' — ' ||
    (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[m.mes]
    || ' ' || m.anio,
  m.monto,
  m.fecha_pago,
  s.jugador_id,
  m.mes,
  m.anio,
  'Seed demo presentación',
  m.id
FROM _seed_demo_presentacion_185 s
JOIN mensualidades m ON m.jugador_id = s.jugador_id
  AND m.anio = 2026 AND m.mes IN (6, 7, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM movimientos mv
  WHERE mv.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND mv.mensualidad_id = m.id
    AND mv.categoria = 'mensualidad'
);

INSERT INTO audit_log (club_id, entity_type, entity_id, action, after, user_id)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'::uuid,
  'mensualidades',
  m.id,
  'pagar',
  jsonb_build_object('monto', m.monto, 'metodo', m.metodo, 'seed', 'demo_presentacion'),
  NULL
FROM _seed_demo_presentacion_185 s
JOIN mensualidades m ON m.jugador_id = s.jugador_id
  AND m.anio = 2026 AND m.mes IN (6, 7, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log a
  WHERE a.entity_type = 'mensualidades'
    AND a.entity_id = m.id
    AND a.action = 'pagar'
    AND a.after ->> 'seed' = 'demo_presentacion'
);

SELECT
  j.nombre,
  (SELECT count(*) FROM feedback_jugadores f WHERE f.jugador_id = j.id) AS feedbacks,
  (SELECT count(*) FROM asistencia a WHERE a.jugador_id = j.id AND a.estado = 'presente') AS asistencias,
  (SELECT count(*) FROM mensualidades m WHERE m.jugador_id = j.id AND m.estado = 'pagado') AS pagos
FROM jugadores j
JOIN _seed_demo_presentacion_185 s ON s.jugador_id = j.id;

DROP TABLE _seed_demo_presentacion_185;

COMMIT;
