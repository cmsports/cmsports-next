-- Módulos habilitados por club
-- Permite vender combinaciones distintas de módulos a cada club.
-- Core (dashboard, jugadores) siempre están disponibles; este array
-- controla los opcionales.

ALTER TABLE clubes
ADD COLUMN IF NOT EXISTS modulos_habilitados text[]
DEFAULT '{torneos,liga,clases,calendario,asistencia,mensualidades,finanzas,redes,tienda}';

-- Clubs existentes quedan con todo habilitado
UPDATE clubes
SET modulos_habilitados = '{torneos,liga,clases,calendario,asistencia,mensualidades,finanzas,redes,tienda}'
WHERE modulos_habilitados IS NULL;
