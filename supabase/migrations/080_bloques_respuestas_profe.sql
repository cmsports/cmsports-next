-- Últimas asignaciones de bloque y mensualidades, según respondió el profe.
--
--   · Nicolás Díaz    -> Paine, lunes y viernes 18:30-20:30
--   · Randy Rivera    -> Paine, lunes y viernes 18:30-20:30 (tenía mar/mié,
--                        días en los que ese bloque no abre en Fátima)
--   · Vicente García  -> Paine, lunes y viernes 18:30-20:30 (no tenía ningún
--                        día marcado)
--   · Lucas Morales   -> Buin, solo jueves 18:30-20:30. Sale de Grupo AM, que
--                        funciona miércoles y viernes y por eso lo dejaba sin
--                        bloque al entrenar los jueves.
--   · Ian Lagos y Mateo Mujica -> mensualidad $30.000.
--
-- Los seis que el profe pidió dar de baja (Luciano Colmenárez, Tomás
-- Contreras, José López, Álvaro Moya, Alberto Vergara y Jesús Colmenárez) NO
-- se tocan acá: se eliminan desde la ficha de cada uno en la plataforma, que
-- además borra su cuenta de acceso. En SQL quedarían usuarios huérfanos.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. Sede, bloque y días ────────────────────────────────────────────────
UPDATE jugadores SET
  sede = 'paine', horario = '18:30-20:30',
  entrena_lun = true,  entrena_mar = false, entrena_mie = false,
  entrena_jue = false, entrena_vie = true
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    nombre ILIKE '%nicolas%diaz%balcazar%'
    OR nombre ILIKE '%randy%rivera%'
    OR nombre ILIKE '%vicente%garc%a%ag%ero%'
  );

UPDATE jugadores SET
  sede = 'buin', horario = '18:30-20:30',
  entrena_lun = false, entrena_mar = false, entrena_mie = false,
  entrena_jue = true,  entrena_vie = false
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nombre ILIKE '%lucas%morales%fuentes%';

-- ── 2. Mensualidades de los dos jugadores nuevos ──────────────────────────
-- Ian pagó $7.500 proporcionales en julio porque entró terminando el mes; la
-- cuota que corresponde de aquí en adelante es $30.000.
UPDATE jugadores SET mensualidad = 30000
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (nombre ILIKE '%lagos%torres%' OR nombre ILIKE '%mujica%');

-- ── 3. Reasignar sus bloques ──────────────────────────────────────────────
-- Se limpian primero los que tuvieran: Lucas venía de Grupo AM y los demás
-- pudieron quedar en un bloque que ya no corresponde.
DELETE FROM bloque_jugadores bj
USING jugadores j
WHERE bj.jugador_id = j.id
  AND j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    j.nombre ILIKE '%nicolas%diaz%balcazar%' OR j.nombre ILIKE '%randy%rivera%'
    OR j.nombre ILIKE '%vicente%garc%a%ag%ero%' OR j.nombre ILIKE '%lucas%morales%fuentes%'
  );

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
 AND b.hora_inicio = '18:30'::time
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND d.entrena = true
  AND (
    j.nombre ILIKE '%nicolas%diaz%balcazar%' OR j.nombre ILIKE '%randy%rivera%'
    OR j.nombre ILIKE '%vicente%garc%a%ag%ero%' OR j.nombre ILIKE '%lucas%morales%fuentes%'
  )
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Verificación: cómo quedaron los seis ──────────────────────────────────
SELECT j.nombre, j.sede, j.horario, j.mensualidad,
       b.dia_semana, to_char(b.hora_inicio,'HH24:MI') AS hora, b.nombre AS bloque
FROM jugadores j
LEFT JOIN bloque_jugadores bj ON bj.jugador_id = j.id
LEFT JOIN bloques_horario b   ON b.id = bj.bloque_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    j.nombre ILIKE '%nicolas%diaz%balcazar%' OR j.nombre ILIKE '%randy%rivera%'
    OR j.nombre ILIKE '%vicente%garc%a%ag%ero%' OR j.nombre ILIKE '%lucas%morales%fuentes%'
    OR j.nombre ILIKE '%lagos%torres%' OR j.nombre ILIKE '%mujica%'
  )
ORDER BY j.nombre, array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);
