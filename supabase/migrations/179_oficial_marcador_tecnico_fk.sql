-- FK oficial_partidos.marcador_id → tecnico_partidos(id).
-- La columna ya existe desde 156 sin FK; el bridge escribe el vínculo.
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('179_oficial_marcador_tecnico_fk');

-- Huérfanos (si hubiera marcador_id apuntando a un técnico borrado) antes del FK.
UPDATE oficial_partidos op
SET marcador_id = NULL,
    actualizado_en = now()
WHERE op.marcador_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tecnico_partidos tp WHERE tp.id = op.marcador_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.oficial_partidos'::regclass
      AND conname = 'oficial_partidos_marcador_id_fkey'
  ) THEN
    ALTER TABLE public.oficial_partidos
      ADD CONSTRAINT oficial_partidos_marcador_id_fkey
      FOREIGN KEY (marcador_id) REFERENCES public.tecnico_partidos(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS oficial_partidos_marcador_idx
  ON public.oficial_partidos (marcador_id)
  WHERE marcador_id IS NOT NULL;

COMMIT;
