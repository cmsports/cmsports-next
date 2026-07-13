-- Agregar 'archivado' como estado válido de torneos
ALTER TABLE torneos DROP CONSTRAINT IF EXISTS torneos_estado_check;
ALTER TABLE torneos ADD CONSTRAINT torneos_estado_check
  CHECK (estado IN ('en_curso', 'finalizado', 'cancelado', 'archivado'));
