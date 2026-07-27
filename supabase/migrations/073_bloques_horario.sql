-- Horario semanal de la Asociación como estructura del sistema.
--
-- Hasta ahora el bloque de un jugador era un texto suelto (`jugadores.horario`)
-- con cuatro opciones fijas que no coinciden con la realidad: el bloque de la
-- tarde en Buin empieza 16:30 los lunes y viernes, y 17:00 de martes a jueves,
-- con nombres y profesores distintos. Eso no se puede representar en un texto.
--
-- Acá el bloque pasa a ser una entidad con nombre, sede, día, horario, profesor
-- y cupo — tal como el club lo piensa y como está en su Excel.
--
-- Esta migración SOLO crea la estructura y carga el horario. No toca asistencia
-- ni mueve jugadores: eso va en una etapa aparte, con los datos ya validados.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ============================================================
-- 1. PROFESORES
-- ============================================================
INSERT INTO profesores (club_id, nombre, activo)
SELECT 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', n.nombre, true
FROM (VALUES ('Jorge Muñoz'), ('Rodrigo Salazar'), ('Alejandro Garcés')) AS n(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesores p
  WHERE p.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND lower(p.nombre) = lower(n.nombre)
);


-- ============================================================
-- 2. BLOQUES DEL HORARIO SEMANAL
-- ============================================================
CREATE TABLE IF NOT EXISTS bloques_horario (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre       text NOT NULL,                       -- 'Todo Público 1', 'Adulto-Master'…
  sede         text NOT NULL CHECK (sede IN ('buin', 'paine')),
  dia_semana   text NOT NULL CHECK (dia_semana IN ('lun','mar','mie','jue','vie','sab','dom')),
  hora_inicio  time NOT NULL,
  hora_fin     time NOT NULL,
  cupo_maximo  integer NOT NULL DEFAULT 0,          -- lugares para jugadores con días fijos
  cupo_libres  integer NOT NULL DEFAULT 0,          -- lugares reservados para plan libre acceso
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, sede, dia_semana, hora_inicio)
);

CREATE INDEX IF NOT EXISTS bloques_horario_club_idx ON bloques_horario (club_id, activo);

ALTER TABLE bloques_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloques_lectura_club" ON bloques_horario;
CREATE POLICY "bloques_lectura_club" ON bloques_horario
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "bloques_gestion_staff" ON bloques_horario;
CREATE POLICY "bloques_gestion_staff" ON bloques_horario
  FOR ALL USING (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );


-- ============================================================
-- 3. PROFESORES POR BLOQUE
-- ============================================================
-- Tabla aparte porque en Fátima varios bloques los toman dos profes a la vez
-- ("Rodrigo y Jorge"), y con una sola columna no se puede.
CREATE TABLE IF NOT EXISTS bloque_profesores (
  bloque_id   uuid NOT NULL REFERENCES bloques_horario(id) ON DELETE CASCADE,
  profesor_id uuid NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  PRIMARY KEY (bloque_id, profesor_id)
);

ALTER TABLE bloque_profesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloque_prof_lectura" ON bloque_profesores;
CREATE POLICY "bloque_prof_lectura" ON bloque_profesores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "bloque_prof_gestion" ON bloque_profesores;
CREATE POLICY "bloque_prof_gestion" ON bloque_profesores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bloques_horario b WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );


-- ============================================================
-- 4. CARGA DEL HORARIO (Excel del profe, temporada 2026)
-- ============================================================
-- Cupos: Buin 12 + 5 libres · Fátima Paine 30 + 5 libres.
INSERT INTO bloques_horario
  (club_id, nombre, sede, dia_semana, hora_inicio, hora_fin, cupo_maximo, cupo_libres)
VALUES
  -- ── ACADEMIA BUIN ──────────────────────────────────────────
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Grupo AM',                     'buin', 'mie', '09:00', '11:00', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Grupo AM',                     'buin', 'vie', '09:00', '11:00', 12, 5),

  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Todo Público 1',               'buin', 'lun', '16:30', '18:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Todo Público 1',               'buin', 'vie', '16:30', '18:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Avanzado',             'buin', 'mar', '17:00', '19:00', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Avanzado',             'buin', 'mie', '17:00', '19:00', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Avanzado',             'buin', 'jue', '17:00', '19:00', 12, 5),

  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Todo Público 2',               'buin', 'lun', '18:30', '20:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Todo Público 2',               'buin', 'vie', '18:30', '20:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Formativo Intermedio', 'buin', 'mar', '18:30', '20:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Formativo Intermedio', 'buin', 'mie', '18:30', '20:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Formativo Intermedio', 'buin', 'jue', '18:30', '20:30', 12, 5),

  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'buin', 'lun', '20:30', '22:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'buin', 'mie', '20:30', '22:30', 12, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'buin', 'jue', '20:30', '22:30', 12, 5),

  -- ── FÁTIMA PAINE ───────────────────────────────────────────
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Todos los Niveles',    'paine', 'lun', '18:30', '20:30', 30, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Menores Todos los Niveles',    'paine', 'vie', '18:30', '20:30', 30, 5),

  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'paine', 'lun', '20:30', '22:30', 30, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'paine', 'mie', '20:30', '22:30', 30, 5),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'Adulto - Master',              'paine', 'vie', '20:30', '22:30', 30, 5)
ON CONFLICT (club_id, sede, dia_semana, hora_inicio) DO NOTHING;


-- ============================================================
-- 5. ASIGNACIÓN DE PROFESORES A CADA BLOQUE
-- ============================================================
WITH asignaciones(sede, dia_semana, hora_inicio, profesor) AS (VALUES
  -- Buin
  ('buin', 'mie', '09:00'::time, 'Jorge Muñoz'),
  ('buin', 'vie', '09:00'::time, 'Jorge Muñoz'),

  ('buin', 'lun', '16:30'::time, 'Alejandro Garcés'),
  ('buin', 'vie', '16:30'::time, 'Rodrigo Salazar'),
  ('buin', 'mar', '17:00'::time, 'Alejandro Garcés'),
  ('buin', 'mie', '17:00'::time, 'Jorge Muñoz'),
  ('buin', 'jue', '17:00'::time, 'Alejandro Garcés'),

  ('buin', 'lun', '18:30'::time, 'Alejandro Garcés'),
  ('buin', 'mar', '18:30'::time, 'Rodrigo Salazar'),
  ('buin', 'mie', '18:30'::time, 'Jorge Muñoz'),
  ('buin', 'jue', '18:30'::time, 'Jorge Muñoz'),
  ('buin', 'vie', '18:30'::time, 'Rodrigo Salazar'),

  ('buin', 'lun', '20:30'::time, 'Alejandro Garcés'),
  ('buin', 'mie', '20:30'::time, 'Rodrigo Salazar'),
  ('buin', 'jue', '20:30'::time, 'Jorge Muñoz'),

  -- Fátima Paine (varios bloques con dos profesores)
  ('paine', 'lun', '18:30'::time, 'Rodrigo Salazar'),
  ('paine', 'lun', '18:30'::time, 'Jorge Muñoz'),
  ('paine', 'vie', '18:30'::time, 'Alejandro Garcés'),
  ('paine', 'vie', '18:30'::time, 'Jorge Muñoz'),

  ('paine', 'lun', '20:30'::time, 'Rodrigo Salazar'),
  ('paine', 'lun', '20:30'::time, 'Jorge Muñoz'),
  ('paine', 'mie', '20:30'::time, 'Jorge Muñoz'),
  ('paine', 'vie', '20:30'::time, 'Alejandro Garcés'),
  ('paine', 'vie', '20:30'::time, 'Jorge Muñoz')
)
INSERT INTO bloque_profesores (bloque_id, profesor_id)
SELECT b.id, p.id
FROM asignaciones a
JOIN bloques_horario b
  ON b.club_id     = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
 AND b.sede        = a.sede
 AND b.dia_semana  = a.dia_semana
 AND b.hora_inicio = a.hora_inicio
JOIN profesores p
  ON p.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
 AND lower(p.nombre) = lower(a.profesor)
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Revisión: así queda el horario cargado ────────────────────────────────
SELECT
  b.sede,
  b.dia_semana,
  to_char(b.hora_inicio, 'HH24:MI') || ' - ' || to_char(b.hora_fin, 'HH24:MI') AS horario,
  b.nombre,
  string_agg(p.nombre, ' + ' ORDER BY p.nombre)                               AS profesores,
  b.cupo_maximo,
  b.cupo_libres
FROM bloques_horario b
LEFT JOIN bloque_profesores bp ON bp.bloque_id = b.id
LEFT JOIN profesores p         ON p.id = bp.profesor_id
WHERE b.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
GROUP BY b.id, b.sede, b.dia_semana, b.hora_inicio, b.hora_fin, b.nombre, b.cupo_maximo, b.cupo_libres
ORDER BY b.sede, b.hora_inicio,
  array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana);
