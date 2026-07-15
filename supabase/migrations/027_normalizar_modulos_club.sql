-- Mantiene el catálogo de módulos comercializables normalizado.
ALTER TABLE clubes
ALTER COLUMN modulos_habilitados
SET DEFAULT '{torneos,liga,clases,calendario,asistencia,mensualidades,finanzas,redes,tienda}';
