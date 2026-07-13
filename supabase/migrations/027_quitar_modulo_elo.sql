-- ELO/Ranking ya no forma parte de los módulos comercializables.
ALTER TABLE clubes
ALTER COLUMN modulos_habilitados
SET DEFAULT '{torneos,liga,clases,calendario,asistencia,mensualidades,finanzas,redes,tienda}';

UPDATE clubes
SET modulos_habilitados = array_remove(modulos_habilitados, 'elo')
WHERE modulos_habilitados @> ARRAY['elo']::text[];
