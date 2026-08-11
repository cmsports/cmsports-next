-- Soporte para conservar el original y generar una copia optimizada para análisis.
--
-- El original puede venir desde un iPhone en 4K. La versión de análisis será
-- la que use el reproductor; nunca se destruye el archivo original.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('166_video_original_y_version_analisis');

ALTER TABLE tecnico_videos
  ADD COLUMN IF NOT EXISTS analisis_path text,
  ADD COLUMN IF NOT EXISTS estado_procesamiento text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS error_procesamiento text,
  ADD COLUMN IF NOT EXISTS mime_analisis text,
  ADD COLUMN IF NOT EXISTS tamano_analisis bigint,
  ADD COLUMN IF NOT EXISTS resolucion_original text,
  ADD COLUMN IF NOT EXISTS resolucion_analisis text,
  ADD COLUMN IF NOT EXISTS procesado_en timestamptz;

ALTER TABLE tecnico_videos
  DROP CONSTRAINT IF EXISTS tecnico_videos_estado_procesamiento_check;

ALTER TABLE tecnico_videos
  ADD CONSTRAINT tecnico_videos_estado_procesamiento_check
  CHECK (estado_procesamiento IN ('pendiente', 'procesando', 'listo', 'error', 'omitido'));

CREATE INDEX IF NOT EXISTS tecnico_videos_procesamiento_idx
  ON tecnico_videos (club_id, estado_procesamiento, creado_en);

-- 2 GB permite conservar videos largos de iPhone mientras se genera la copia
-- liviana. El límite real recomendado para el uso cotidiano será menor.
UPDATE storage.buckets
SET file_size_limit = 2147483648
WHERE id = 'tecnico-videos';

COMMENT ON COLUMN tecnico_videos.archivo_path IS
  'Ruta del original privado, conservado para archivo y futuras conversiones.';
COMMENT ON COLUMN tecnico_videos.analisis_path IS
  'Ruta de la copia optimizada usada por el reproductor técnico.';
COMMENT ON COLUMN tecnico_videos.estado_procesamiento IS
  'Estado de la generación de la copia de análisis.';

COMMIT;
