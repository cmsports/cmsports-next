-- Alta de Edison Muñoz Hernández.
--
-- Entrena Grupo AM tres veces por semana y aparece tanto en la planilla de
-- cupos como en la hoja de asistencia de julio, pero nunca entró al sistema:
-- los 106 jugadores se cargaron desde la planilla de pagos, y él no figuraba
-- ahí. Sin ficha, el profe no podía pasarle asistencia ni cobrarle.
--
-- Datos: hoja "IDENTIFICACION + DIAS ENTRE." del Excel de asistencia.
-- Mensualidad ($20.000) confirmada por el profe.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

INSERT INTO jugadores (
  club_id, nombre, nombres, apellido1, apellido2,
  rut, telefono, fecha_nacimiento,
  categoria, categorias, grupo, sede, horario,
  entrena_lun, entrena_mar, entrena_mie, entrena_jue, entrena_vie,
  tipo_plan, entrenamientos_por_semana, mensualidad,
  sesiones_usadas, sesiones_limite, estado, es_externo
)
SELECT
  'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc',
  'Edison Muñoz Hernández', 'Edison', 'Muñoz', 'Hernández',
  '21589290-5', '+56937073626',
  '2004-03-21',                 -- serial 38068 del Excel
  'TC', ARRAY['TC'], 'ADU', 'buin', '09:00-11:00',
  true, false, true, false, true,   -- lunes, miércoles y viernes
  'mensual', 3, 20000,
  0, 12, 'activo', false
WHERE NOT EXISTS (
  SELECT 1 FROM jugadores
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND public._norm_nombre(nombre) = public._norm_nombre('Edison Muñoz Hernández')
);

-- Sus bloques: Grupo AM de miércoles y viernes.
-- El lunes queda pendiente: la planilla de cupos tiene una sesión de Grupo AM
-- ese día, pero el horario de profesores no la incluye y el bloque no existe.
INSERT INTO bloque_jugadores (bloque_id, jugador_id)
SELECT b.id, j.id
FROM bloques_horario b
CROSS JOIN jugadores j
WHERE b.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND b.sede = 'buin'
  AND b.hora_inicio = '09:00'
  AND b.dia_semana IN ('mie', 'vie')
  AND j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND public._norm_nombre(j.nombre) = public._norm_nombre('Edison Muñoz Hernández')
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT j.nombre, j.rut, j.grupo, j.sede, j.categoria, j.mensualidad,
       b.dia_semana, to_char(b.hora_inicio,'HH24:MI') AS hora, b.nombre AS bloque
FROM jugadores j
LEFT JOIN bloque_jugadores bj ON bj.jugador_id = j.id
LEFT JOIN bloques_horario b   ON b.id = bj.bloque_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND public._norm_nombre(j.nombre) = public._norm_nombre('Edison Muñoz Hernández')
ORDER BY array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);
