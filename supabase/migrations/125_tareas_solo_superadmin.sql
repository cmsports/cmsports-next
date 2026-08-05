-- ────────────────────────────────────────────────────────────
-- Tareas pasa de ser un módulo de club a una lista privada del superadmin.
--
-- La 122 la creó con `club_id` y visible para admin y profesor de cada club.
-- Estaba mal entendido: la lista es de los dueños de la plataforma —Marcela y
-- su socio— para anotar lo que hay que hacer en CmSports. No tiene nada que
-- ver con la operación de un club y ningún admin de club debería verla.
--
-- Se puede soltar `club_id` sin migrar datos porque el módulo nunca se activó
-- para ningún club y la tabla está vacía. Si algún día hubiera que revivir la
-- versión por club, es una tabla nueva, no esta.
-- ────────────────────────────────────────────────────────────

-- El índice cuelga de club_id, así que se va primero.
DROP INDEX IF EXISTS tareas_club_idx;

ALTER TABLE tareas DROP COLUMN IF EXISTS club_id;

CREATE INDEX IF NOT EXISTS tareas_estado_idx ON tareas(estado, creada_en);

-- La política vieja filtraba por club_id, que ya no existe: sin este cambio la
-- tabla queda ilegible para todos.
DROP POLICY IF EXISTS tareas_staff_del_club ON tareas;

DROP POLICY IF EXISTS tareas_solo_superadmin ON tareas;
CREATE POLICY tareas_solo_superadmin ON tareas
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');
