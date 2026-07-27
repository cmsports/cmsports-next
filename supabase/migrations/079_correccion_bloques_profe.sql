-- Correcciones que confirmó el profe sobre los jugadores sin bloque.
--
--   · Ian Lagos      -> Paine, lunes y viernes 18:30-20:30
--   · Mateo Mujica   -> Buin,  martes y viernes 18:30-20:30
--   · Caro, Constanza y Cristóbal Zurita, Matías Rivas -> Paine, lunes y
--     viernes 18:30-20:30. Tenían cargado 17:00-18:30, un bloque que en
--     Fátima no existe: por eso quedaban sin asignar.
--   · Iván Araya     -> Paine, lunes y viernes 20:30-22:30 (adulto). Tenía
--     17:00-18:30 y entrenaba miércoles.
--
-- Grupo AM de los lunes no existe: el profe confirmó que solo funciona
-- miércoles y viernes. La planilla de cupos estaba desactualizada en eso.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. Los dos jugadores que estaban sin ningún dato ──────────────────────
-- Se les asume grupo MEN por el bloque que les corresponde. La mensualidad
-- queda pendiente: el profe todavía no la definió.
UPDATE jugadores SET
  sede = 'paine', grupo = COALESCE(grupo, 'MEN'), horario = '18:30-20:30',
  entrena_lun = true,  entrena_mar = false, entrena_mie = false,
  entrena_jue = false, entrena_vie = true
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nombre ILIKE '%lagos%torres%';

UPDATE jugadores SET
  sede = 'buin', grupo = COALESCE(grupo, 'MEN'), horario = '18:30-20:30',
  entrena_lun = false, entrena_mar = true,  entrena_mie = false,
  entrena_jue = false, entrena_vie = true
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nombre ILIKE '%mujica%';

-- ── 2. Los cuatro de Paine que tenían horario de tarde ────────────────────
UPDATE jugadores SET
  sede = 'paine', horario = '18:30-20:30',
  entrena_lun = true,  entrena_mar = false, entrena_mie = false,
  entrena_jue = false, entrena_vie = true
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    nombre ILIKE '%caro%ramirez%'
    OR nombre ILIKE '%constanza%zurita%'
    OR nombre ILIKE '%crist%bal alonso%zurita%'
    OR nombre ILIKE '%matias rivas%'
  );

-- ── 3. Iván Araya pasa al bloque de adultos ───────────────────────────────
UPDATE jugadores SET
  sede = 'paine', horario = '20:30-22:30',
  entrena_lun = true,  entrena_mar = false, entrena_mie = false,
  entrena_jue = false, entrena_vie = true
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nombre ILIKE '%ivan araya%';

-- ── 4. Asignarles su bloque según sede, horario y días ────────────────────
INSERT INTO bloque_jugadores (bloque_id, jugador_id)
SELECT b.id, j.id
FROM jugadores j
CROSS JOIN LATERAL (VALUES
  ('lun', j.entrena_lun), ('mar', j.entrena_mar), ('mie', j.entrena_mie),
  ('jue', j.entrena_jue), ('vie', j.entrena_vie)
) AS d(dia, entrena)
JOIN bloques_horario b
  ON b.club_id     = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
 AND b.sede        = j.sede
 AND b.dia_semana  = d.dia
 AND b.hora_inicio = CASE j.horario
       WHEN '18:30-20:30' THEN '18:30'::time
       WHEN '20:30-22:30' THEN '20:30'::time
     END
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND d.entrena = true
  AND (
    j.nombre ILIKE '%lagos%torres%'      OR j.nombre ILIKE '%mujica%'
    OR j.nombre ILIKE '%caro%ramirez%'   OR j.nombre ILIKE '%constanza%zurita%'
    OR j.nombre ILIKE '%crist%bal alonso%zurita%'
    OR j.nombre ILIKE '%matias rivas%'   OR j.nombre ILIKE '%ivan araya%'
  )
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Verificación: cómo quedaron los siete ─────────────────────────────────
SELECT j.nombre, j.sede, j.horario,
       b.dia_semana, to_char(b.hora_inicio,'HH24:MI') AS hora, b.nombre AS bloque
FROM jugadores j
LEFT JOIN bloque_jugadores bj ON bj.jugador_id = j.id
LEFT JOIN bloques_horario b   ON b.id = bj.bloque_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    j.nombre ILIKE '%lagos%torres%'      OR j.nombre ILIKE '%mujica%'
    OR j.nombre ILIKE '%caro%ramirez%'   OR j.nombre ILIKE '%constanza%zurita%'
    OR j.nombre ILIKE '%crist%bal alonso%zurita%'
    OR j.nombre ILIKE '%matias rivas%'   OR j.nombre ILIKE '%ivan araya%'
  )
ORDER BY j.nombre, array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);
