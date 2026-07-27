-- Paso 1: el grupo pasa a ser una cosa del sistema, y los días cuelgan de él.
--
-- Hoy "Menores Avanzado" son tres filas sueltas de bloques_horario que solo se
-- parecen en que dice lo mismo en la columna nombre. Eso trae dos problemas:
-- para crear el grupo hay que llenar el formulario una vez por día, y si le
-- cambiás el nombre a una fila se desarma en dos grupos distintos.
--
-- Con `grupos_entrenamiento` el grupo tiene identidad propia. Los bloques pasan
-- a ser sus días, cada uno con su horario: en Buin el lunes parte 16:30 y el
-- martes 17:00, así que la hora no puede vivir en el grupo.
--
-- El cupo se queda en el bloque a propósito. Es una capacidad de sesión —mesas,
-- profesores presentes— y puede diferir entre el lunes y el jueves aunque hoy
-- estén todos iguales. El formulario lo aplica a todos los días de una vez.
--
-- Esta migración no cambia nada de lo que se ve: solo agrupa lo que ya existe.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. La tabla ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grupos_entrenamiento (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre    text NOT NULL,                      -- 'Menores Avanzado', 'Grupo AM'…
  sede      text NOT NULL CHECK (sede IN ('buin', 'paine')),
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  -- El mismo nombre puede existir en las dos sedes: "Adulto - Master" está en
  -- Buin y en Fátima y son grupos distintos, con gente distinta.
  UNIQUE (club_id, sede, nombre)
);

ALTER TABLE grupos_entrenamiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupos_lectura_club" ON grupos_entrenamiento;
CREATE POLICY "grupos_lectura_club" ON grupos_entrenamiento
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "grupos_gestion_staff" ON grupos_entrenamiento;
CREATE POLICY "grupos_gestion_staff" ON grupos_entrenamiento
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));


-- ── 2. Un grupo por cada nombre que ya existe ─────────────────────────────
INSERT INTO grupos_entrenamiento (club_id, nombre, sede)
SELECT DISTINCT b.club_id, b.nombre, b.sede
FROM bloques_horario b
ON CONFLICT (club_id, sede, nombre) DO NOTHING;


-- ── 3. Colgar los bloques de su grupo ─────────────────────────────────────
ALTER TABLE bloques_horario
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES grupos_entrenamiento(id) ON DELETE CASCADE;

UPDATE bloques_horario b SET grupo_id = g.id
FROM grupos_entrenamiento g
WHERE g.club_id = b.club_id AND g.sede = b.sede AND g.nombre = b.nombre
  AND b.grupo_id IS NULL;

-- Freno de mano: si quedó algún bloque sin grupo, algo no emparejó y es mejor
-- no seguir con la columna en NOT NULL.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM bloques_horario WHERE grupo_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'Quedaron % bloques sin grupo. No se continúa.', n; END IF;
END $$;

ALTER TABLE bloques_horario ALTER COLUMN grupo_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS bloques_horario_grupo_idx ON bloques_horario (grupo_id);


-- ── 4. El nombre del bloque deja de ser la verdad ─────────────────────────
-- Se conserva la columna porque hay consultas que la leen, pero a partir de
-- ahora el nombre bueno es el del grupo. Este disparador los mantiene iguales
-- para que ninguna pantalla vieja muestre algo distinto mientras se migran.
CREATE OR REPLACE FUNCTION public.sincronizar_nombre_bloque()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT g.nombre, g.sede INTO NEW.nombre, NEW.sede
  FROM grupos_entrenamiento g WHERE g.id = NEW.grupo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloque_hereda_nombre ON bloques_horario;
CREATE TRIGGER bloque_hereda_nombre
  BEFORE INSERT OR UPDATE OF grupo_id ON bloques_horario
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_nombre_bloque();

-- Y al revés: renombrar el grupo renombra sus días.
CREATE OR REPLACE FUNCTION public.propagar_nombre_grupo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nombre IS DISTINCT FROM OLD.nombre OR NEW.sede IS DISTINCT FROM OLD.sede THEN
    UPDATE bloques_horario SET nombre = NEW.nombre, sede = NEW.sede WHERE grupo_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grupo_propaga_nombre ON grupos_entrenamiento;
CREATE TRIGGER grupo_propaga_nombre
  AFTER UPDATE ON grupos_entrenamiento
  FOR EACH ROW EXECUTE FUNCTION public.propagar_nombre_grupo();

COMMIT;


-- ── Verificación: los grupos con sus días y su gente ──────────────────────
SELECT g.sede,
       g.nombre                                        AS grupo,
       count(DISTINCT b.id)                            AS dias,
       string_agg(DISTINCT b.dia_semana, ' ' ORDER BY b.dia_semana) AS cuales,
       count(DISTINCT bj.jugador_id)                   AS jugadores
FROM grupos_entrenamiento g
LEFT JOIN bloques_horario b   ON b.grupo_id = g.id
LEFT JOIN bloque_jugadores bj ON bj.bloque_id = b.id
WHERE g.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
GROUP BY g.id, g.sede, g.nombre
ORDER BY g.sede, g.nombre;
