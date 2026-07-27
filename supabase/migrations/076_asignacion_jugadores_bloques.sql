-- Paso 5: a qué bloque va cada jugador.
--
-- Hasta ahora esto vivía en la planilla "CUPOS JULIO" del Excel de asistencia.
-- Acá pasa a ser una tabla del sistema, que es la que después alimenta el
-- control de cupos y la lista de asistencia.
--
-- Origen de los datos:
--   · Buin  -> la planilla de cupos, día por día y bloque por bloque.
--   · Paine -> regla del profe: quien entrena ese día y no aparece en la
--              planilla de Buin, entrena en Fátima.
--
-- Se corrigieron ocho nombres mal escritos en la planilla (Colombia González,
-- fernado bastias, Chuequeman, denser, eric rubio, espina, Cania, fredi) y se
-- omitieron seis personas que el profe confirmó que ya no están en el club.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Al final informa la ocupación de cada bloque y quién quedó sin asignar.

BEGIN;

CREATE TABLE IF NOT EXISTS bloque_jugadores (
  bloque_id  uuid NOT NULL REFERENCES bloques_horario(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloque_id, jugador_id)
);

CREATE INDEX IF NOT EXISTS bloque_jugadores_jugador_idx ON bloque_jugadores (jugador_id);

ALTER TABLE bloque_jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloque_jug_lectura" ON bloque_jugadores;
CREATE POLICY "bloque_jug_lectura" ON bloque_jugadores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "bloque_jug_gestion" ON bloque_jugadores;
CREATE POLICY "bloque_jug_gestion" ON bloque_jugadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );


-- ── Asignaciones de Buin, tal como están en la planilla de cupos ──────────
CREATE TEMP TABLE _asig (dia text, hora_inicio time, nombre_cupo text);

INSERT INTO _asig (dia, hora_inicio, nombre_cupo) VALUES
  ('lun','09:00','ivan loyola'),
  ('lun','09:00','edison munoz'),
  ('lun','16:30','maximiliano flores'),
  ('lun','16:30','colomba gonzalez'),
  ('lun','16:30','simon luengo'),
  ('lun','16:30','diego ramirez'),
  ('lun','16:30','franco rencoret cortez'),
  ('lun','16:30','rudy lopez'),
  ('lun','16:30','sofia salgado'),
  ('lun','18:30','agustin calderon'),
  ('lun','18:30','isidora gomez'),
  ('lun','18:30','facundo gomez'),
  ('lun','18:30','alan imilqueo'),
  ('lun','18:30','osvaldo bastias'),
  ('lun','18:30','fernando bastias'),
  ('lun','18:30','bastian cheuqueman'),
  ('lun','18:30','maximiliano cabrera'),
  ('lun','18:30','tomas quintana'),
  ('lun','18:30','ricardo suarez'),
  ('lun','18:30','martin denzer'),
  ('lun','18:30','mateo cano'),
  ('lun','18:30','alberto honores'),
  ('lun','18:30','vilma letelier'),
  ('lun','20:30','arnaldo marchant'),
  ('lun','20:30','cristobal garcia'),
  ('lun','20:30','rodrigo pizarro'),
  ('lun','20:30','crisse acevedo'),
  ('lun','20:30','carlos vera'),
  ('lun','20:30','jose leiva'),
  ('lun','20:30','cristopher martinez'),
  ('lun','20:30','erick rubio'),
  ('lun','20:30','jonathan torres'),
  ('mar','17:00','joaquin valderrama'),
  ('mar','17:00','alan imilqueo'),
  ('mar','17:00','agustin quinteros'),
  ('mar','17:00','alonso ferrer'),
  ('mar','17:00','renato amigo'),
  ('mar','17:00','ricardo lopez'),
  ('mar','17:00','julieta amigo'),
  ('mar','17:00','martin morales'),
  ('mar','17:00','daniel torres'),
  ('mar','17:00','maximiliano flores'),
  ('mar','17:00','agustin calderon'),
  ('mar','17:00','facundo gomez'),
  ('mar','18:30','cristobal echeverria'),
  ('mar','18:30','matias vasquez'),
  ('mar','18:30','julian troncoso'),
  ('mar','18:30','david corral'),
  ('mar','18:30','vicente gonzalez'),
  ('mar','18:30','mateo romero'),
  ('mar','18:30','augusto espinoza'),
  ('mar','18:30','maximiliano cabrera'),
  ('mar','18:30','benjamin neira'),
  ('mar','18:30','benjamin vera'),
  ('mar','20:30','juan carlos kania'),
  ('mar','20:30','patricio farias'),
  ('mar','20:30','cristobal garcia'),
  ('mie','09:00','ivan loyola'),
  ('mie','09:00','edison munoz'),
  ('mie','09:00','benjamin arias'),
  ('mie','17:00','joaquin valderrama'),
  ('mie','17:00','ricardo lopez'),
  ('mie','17:00','alan imilqueo'),
  ('mie','17:00','agustin quinteros'),
  ('mie','17:00','jose sanchez'),
  ('mie','17:00','tomas ceballos'),
  ('mie','17:00','vicente seguel'),
  ('mie','17:00','amir bernazar'),
  ('mie','17:00','benjamin gaete'),
  ('mie','17:00','isaias aguilera'),
  ('mie','18:30','juan pablo parra'),
  ('mie','18:30','agustin calderon'),
  ('mie','18:30','benjamin lobos'),
  ('mie','18:30','facundo gomez'),
  ('mie','18:30','alonso ferrer'),
  ('mie','18:30','jose sanchez'),
  ('mie','18:30','david corral'),
  ('mie','18:30','daniel torres'),
  ('mie','18:30','bastian cheuqueman'),
  ('mie','18:30','tomas quintana'),
  ('mie','18:30','benjamin vera'),
  ('mie','18:30','isidora gomez'),
  ('mie','18:30','maximiliano cabrera'),
  ('mie','20:30','jonathan torres'),
  ('mie','20:30','nicolas contreras'),
  ('mie','20:30','arnaldo marchant'),
  ('mie','20:30','eduardo ocares'),
  ('mie','20:30','juan pablo gutierrez'),
  ('mie','20:30','patricio farias'),
  ('mie','20:30','jorge pino'),
  ('mie','20:30','jose leiva'),
  ('mie','20:30','rodrigo pizarro'),
  ('mie','20:30','cristopher martinez'),
  ('mie','20:30','erick rubio'),
  ('mie','20:30','cristian castaneda'),
  ('jue','17:00','alan imilqueo'),
  ('jue','17:00','agustin quinteros'),
  ('jue','17:00','alonso ferrer'),
  ('jue','17:00','amir bernazar'),
  ('jue','17:00','benjamin gaete'),
  ('jue','17:00','vicente seguel'),
  ('jue','17:00','agustin calderon'),
  ('jue','17:00','facundo gomez'),
  ('jue','17:00','victor rodriguez'),
  ('jue','18:30','matias vasquez'),
  ('jue','18:30','cristobal echeverria'),
  ('jue','18:30','julian troncoso'),
  ('jue','18:30','augusto espinoza'),
  ('jue','18:30','mateo romero'),
  ('jue','18:30','colomba gonzalez'),
  ('jue','18:30','simon luengo'),
  ('jue','18:30','diego ramirez'),
  ('jue','18:30','maximiliano cabrera'),
  ('jue','18:30','benjamin neira'),
  ('jue','18:30','mateo cano'),
  ('jue','20:30','patricio farias'),
  ('jue','20:30','victor soto'),
  ('jue','20:30','freddy moyano'),
  ('jue','20:30','nicolas contreras'),
  ('jue','20:30','jonathan torres'),
  ('jue','20:30','erick rubio'),
  ('jue','20:30','jose plaza'),
  ('jue','20:30','cristobal garcia'),
  ('vie','09:00','ivan loyola'),
  ('vie','09:00','edison munoz'),
  ('vie','09:00','benjamin arias'),
  ('vie','16:30','daniel torres'),
  ('vie','16:30','colomba gonzalez'),
  ('vie','16:30','simon luengo'),
  ('vie','16:30','diego ramirez'),
  ('vie','16:30','franco rencoret cortez'),
  ('vie','16:30','florencia albornoz'),
  ('vie','16:30','rudy lopez'),
  ('vie','16:30','sofia salgado'),
  ('vie','16:30','ricardo suarez'),
  ('vie','16:30','martin denzer'),
  ('vie','16:30','alberto honores'),
  ('vie','16:30','vilma letelier'),
  ('vie','18:30','tomas quintana'),
  ('vie','18:30','osvaldo bastias'),
  ('vie','18:30','fernando bastias'),
  ('vie','18:30','vicente gonzalez'),
  ('vie','18:30','juan carlos gonzalez'),
  ('vie','18:30','augusto espinoza'),
  ('vie','18:30','bastian cheuqueman'),
  ('vie','18:30','mateo cano');

-- ── 1. Buin: emparejar por nombre y asignar ───────────────────────────────
-- El nombre en la planilla suele ser más corto que el de la ficha ("jose
-- sanchez" vs "Jose Tomas Sanchez Hernandez"), así que se exige que todas sus
-- palabras estén en el nombre del jugador. Solo se asigna cuando hay un único
-- jugador posible: con la asistencia de por medio, ante la duda no se toca.
WITH candidatos AS (
  SELECT
    b.id AS bloque_id,
    j.id AS jugador_id,
    count(*) OVER (PARTITION BY a.dia, a.hora_inicio, a.nombre_cupo) AS jugadores_posibles
  FROM _asig a
  JOIN bloques_horario b
    ON b.club_id     = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND b.sede        = 'buin'
   AND b.dia_semana  = a.dia
   AND b.hora_inicio = a.hora_inicio
  JOIN jugadores j
    ON j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND (j.es_externo IS NULL OR j.es_externo = false)
   AND (
     SELECT bool_and(palabra = ANY(string_to_array(public._norm_nombre(j.nombre), ' ')))
     FROM unnest(string_to_array(a.nombre_cupo, ' ')) AS palabra
   )
)
INSERT INTO bloque_jugadores (bloque_id, jugador_id)
SELECT bloque_id, jugador_id FROM candidatos WHERE jugadores_posibles = 1
ON CONFLICT DO NOTHING;


-- ── 2. Fátima: quien entrena ese día y no quedó en Buin ───────────────────
-- Solo se aplica a jugadores de Paine o de ambos centros. A los de Buin que no
-- figuran en la planilla no se les inventa una sede: quedan sin asignar y
-- salen en el informe de abajo.
INSERT INTO bloque_jugadores (bloque_id, jugador_id)
SELECT b.id, j.id
FROM jugadores j
CROSS JOIN LATERAL (VALUES
  ('lun', j.entrena_lun), ('mar', j.entrena_mar), ('mie', j.entrena_mie),
  ('jue', j.entrena_jue), ('vie', j.entrena_vie)
) AS d(dia, entrena)
JOIN bloques_horario b
  ON b.club_id    = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
 AND b.sede       = 'paine'
 AND b.dia_semana = d.dia
 AND b.hora_inicio = CASE j.horario
       WHEN '18:30-20:30' THEN '18:30'::time
       WHEN '20:30-22:30' THEN '20:30'::time
     END
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (j.es_externo IS NULL OR j.es_externo = false)
  AND j.sede IN ('paine', 'ambos')
  AND d.entrena = true
  AND NOT EXISTS (
    SELECT 1
    FROM bloque_jugadores bj
    JOIN bloques_horario bb ON bb.id = bj.bloque_id
    WHERE bj.jugador_id = j.id AND bb.dia_semana = d.dia
  )
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Informe 1: ocupación de cada bloque ───────────────────────────────────
SELECT
  b.sede,
  b.dia_semana,
  to_char(b.hora_inicio, 'HH24:MI') AS hora,
  b.nombre,
  count(bj.jugador_id)                        AS inscritos,
  b.cupo_maximo,
  b.cupo_maximo - count(bj.jugador_id)        AS disponibles,
  CASE WHEN count(bj.jugador_id) > b.cupo_maximo THEN '⚠ SOBRE CUPO' ELSE '' END AS alerta
FROM bloques_horario b
LEFT JOIN bloque_jugadores bj ON bj.bloque_id = b.id
WHERE b.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
GROUP BY b.id, b.sede, b.dia_semana, b.hora_inicio, b.nombre, b.cupo_maximo
ORDER BY b.sede, b.hora_inicio,
  array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);


-- ── Informe 2: jugadores sin ningún bloque ────────────────────────────────
SELECT j.nombre, j.grupo, j.sede, j.horario,
       concat_ws(' ',
         CASE WHEN j.entrena_lun THEN 'Lun' END, CASE WHEN j.entrena_mar THEN 'Mar' END,
         CASE WHEN j.entrena_mie THEN 'Mie' END, CASE WHEN j.entrena_jue THEN 'Jue' END,
         CASE WHEN j.entrena_vie THEN 'Vie' END) AS dias_que_entrena
FROM jugadores j
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (j.es_externo IS NULL OR j.es_externo = false)
  AND NOT EXISTS (SELECT 1 FROM bloque_jugadores bj WHERE bj.jugador_id = j.id)
ORDER BY j.sede, j.nombre;


-- ── Informe 3: nombres de la planilla que no se pudieron emparejar ────────
SELECT DISTINCT a.nombre_cupo, a.dia, to_char(a.hora_inicio,'HH24:MI') AS hora
FROM _asig a
WHERE NOT EXISTS (
  SELECT 1 FROM jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND (SELECT bool_and(p = ANY(string_to_array(public._norm_nombre(j.nombre), ' ')))
         FROM unnest(string_to_array(a.nombre_cupo, ' ')) AS p)
)
ORDER BY a.nombre_cupo;
