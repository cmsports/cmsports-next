-- Corrige cuatro asignaciones que la migración 076 no pudo emparejar.
--
-- El nombre en la planilla de cupos y el de la ficha se escriben distinto, y
-- en la 076 los alias quedaron mal:
--   · "augusto espina"      -> se lo pasó a "espinoza", pero la ficha dice Espina.
--   · "cristopher martinez" -> la ficha dice Christopher (con h).
--   · "eric rubio"          -> se lo pasó a "erick", pero la ficha dice Erik.
--   · "rudy lopez"          -> la ficha dice Ruddy (con dos d).
--
-- Queda fuera "edison munoz": está en la hoja de identificación del Excel pero
-- no en la planilla de pagos, así que no tiene ficha en el sistema.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE TEMP TABLE _correccion (dia text, hora_inicio time, nombre_cupo text);

INSERT INTO _correccion (dia, hora_inicio, nombre_cupo) VALUES
  ('mar','18:30','augusto espina'),
  ('jue','18:30','augusto espina'),
  ('vie','18:30','augusto espina'),
  ('lun','20:30','christopher martinez'),
  ('mie','20:30','christopher martinez'),
  ('lun','20:30','erik rubio'),
  ('mie','20:30','erik rubio'),
  ('jue','20:30','erik rubio'),
  ('lun','16:30','ruddy lopez'),
  ('vie','16:30','ruddy lopez');

WITH candidatos AS (
  SELECT
    b.id AS bloque_id,
    j.id AS jugador_id,
    count(*) OVER (PARTITION BY c.dia, c.hora_inicio, c.nombre_cupo) AS jugadores_posibles
  FROM _correccion c
  JOIN bloques_horario b
    ON b.club_id     = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND b.sede        = 'buin'
   AND b.dia_semana  = c.dia
   AND b.hora_inicio = c.hora_inicio
  JOIN jugadores j
    ON j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND (j.es_externo IS NULL OR j.es_externo = false)
   AND (
     SELECT bool_and(palabra = ANY(string_to_array(public._norm_nombre(j.nombre), ' ')))
     FROM unnest(string_to_array(c.nombre_cupo, ' ')) AS palabra
   )
)
INSERT INTO bloque_jugadores (bloque_id, jugador_id)
SELECT bloque_id, jugador_id FROM candidatos WHERE jugadores_posibles = 1
ON CONFLICT DO NOTHING;

-- No hace falta limpiar nada en Fátima: los cuatro son de sede Buin, y la
-- regla de la 076 solo mandaba a Fátima a jugadores de Paine o ambos centros.

COMMIT;


-- ── Verificación: los cuatro quedaron asignados ───────────────────────────
SELECT j.nombre, b.sede, b.dia_semana, to_char(b.hora_inicio,'HH24:MI') AS hora, b.nombre AS bloque
FROM bloque_jugadores bj
JOIN bloques_horario b ON b.id = bj.bloque_id
JOIN jugadores j       ON j.id = bj.jugador_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (j.nombre ILIKE '%espina%' OR j.nombre ILIKE '%christopher%'
    OR j.nombre ILIKE '%erik%'   OR j.nombre ILIKE '%ruddy%')
ORDER BY j.nombre,
  array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);
