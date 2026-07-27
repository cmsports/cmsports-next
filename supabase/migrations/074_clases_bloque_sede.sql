-- Las clases pasan a saber de qué bloque del horario salieron y en qué sede son.
--
-- Hoy una clase de las 18:30 puede ser de Buin o de Fátima y no hay forma de
-- distinguirlas: por eso al pasar asistencia aparecen mezcladas las dos sedes.
-- `bloque_id` además permite regenerar una semana sin duplicar, y más adelante
-- heredar el cupo del bloque.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

ALTER TABLE clases
  ADD COLUMN IF NOT EXISTS bloque_id uuid REFERENCES bloques_horario(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sede      text;

CREATE INDEX IF NOT EXISTS clases_bloque_idx ON clases (bloque_id);
CREATE INDEX IF NOT EXISTS clases_club_fecha_idx ON clases (club_id, fecha);

-- Una sola clase por bloque y fecha: así "generar semana" se puede repetir sin
-- llenar el calendario de duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS clases_bloque_fecha_unica
  ON clases (bloque_id, fecha)
  WHERE bloque_id IS NOT NULL;

COMMIT;
