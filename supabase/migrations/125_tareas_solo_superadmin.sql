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
--
-- ORDEN IMPORTANTE: la política vieja menciona `club_id`, así que Postgres se
-- niega a soltar la columna mientras la política exista
-- (`2BP01: cannot drop column ... because other objects depend on it`).
-- Primero la política, después la columna. No se usa DROP ... CASCADE a
-- propósito: CASCADE se llevaría por delante cualquier otra cosa que dependa
-- de la columna sin decir qué, y en una tabla con RLS eso puede significar
-- quedarse sin las protecciones sin enterarse.
-- ────────────────────────────────────────────────────────────

-- 1. Primero lo que depende de club_id: la política y el índice.
DROP POLICY IF EXISTS tareas_staff_del_club ON tareas;
DROP INDEX IF EXISTS tareas_club_idx;

-- 2. Recién ahora la columna sale sin arrastrar nada.
ALTER TABLE tareas DROP COLUMN IF EXISTS club_id;

-- 3. Y se reconstruye lo que la reemplaza.
CREATE INDEX IF NOT EXISTS tareas_estado_idx ON tareas(estado, creada_en);

DROP POLICY IF EXISTS tareas_solo_superadmin ON tareas;
CREATE POLICY tareas_solo_superadmin ON tareas
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');
