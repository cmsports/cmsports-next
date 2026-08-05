-- ────────────────────────────────────────────────────────────
-- Módulo Tareas: lista de pendientes del club.
--
-- Cada tarea tiene tres estados: 'sin_realizar' (el que trae por defecto),
-- 'parcial' y 'hecho'. Una vez marcada como hecha se queda visible 12 horas y
-- después desaparece de la lista.
--
-- Ese "desaparecer" es un filtro de lectura, NO un borrado: la fila queda en
-- la tabla. Borrar de verdad haría imposible responder "¿esto se hizo?" una
-- semana después, y el volumen de una lista de pendientes no justifica el
-- riesgo. El filtro vive en `src/lib/domain/tareas.ts`.
--
-- `completada_en` la sella un trigger y no la aplicación: es el reloj que
-- decide cuándo se oculta la tarea, así que ningún camino de escritura debe
-- poder dejarla desalineada del estado.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tareas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  texto          text NOT NULL CHECK (length(trim(texto)) > 0),
  estado         text NOT NULL DEFAULT 'sin_realizar'
                   CHECK (estado IN ('sin_realizar', 'parcial', 'hecho')),
  completada_en  timestamptz,
  creada_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tareas_club_idx ON tareas(club_id, estado);

-- El sello de completada va en la base y no en la app.
--
-- Detalle que importa: volver a guardar una tarea que YA estaba hecha no
-- reinicia el contador. Si lo reiniciara, cualquier edición del texto le
-- regalaría 12 horas más de visibilidad y la lista nunca se limpiaría sola.
CREATE OR REPLACE FUNCTION tareas_sella_completada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'hecho' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'hecho') THEN
    NEW.completada_en := now();
  ELSIF NEW.estado <> 'hecho' THEN
    -- Reabrir una tarea la devuelve a la lista sin fecha de término.
    NEW.completada_en := NULL;
  END IF;
  NEW.actualizada_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tareas_sella_completada_trg ON tareas;
CREATE TRIGGER tareas_sella_completada_trg
  BEFORE INSERT OR UPDATE ON tareas
  FOR EACH ROW EXECUTE FUNCTION tareas_sella_completada();

ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

-- Lista operativa del club: la ven y la editan admin, profesor y superadmin.
-- El jugador no: no es su tarea y puede contener notas internas.
DROP POLICY IF EXISTS tareas_staff_del_club ON tareas;
CREATE POLICY tareas_staff_del_club ON tareas
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));
