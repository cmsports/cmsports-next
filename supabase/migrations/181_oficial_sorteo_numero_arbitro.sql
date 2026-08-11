-- Sorteo 2ª fase configurable, numeración ITTF de partidos, árbitro por partido.
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('181_oficial_sorteo_numero_arbitro');

-- Modo de emparejamiento de llaves tras grupos (§3.7 / Apéndice C).
ALTER TABLE oficial_eventos
  ADD COLUMN IF NOT EXISTS modo_sorteo_llave text NOT NULL DEFAULT 'fijo';

DO $$ BEGIN
  ALTER TABLE oficial_eventos
    ADD CONSTRAINT oficial_eventos_modo_sorteo_llave_chk
    CHECK (modo_sorteo_llave IN ('fijo', 'sorteo_segundos', 'serpiente'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Numeración consecutiva estilo ITTF/Koidan para programa y export (§4.5).
ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS numero_ittf integer;

DO $$ BEGIN
  ALTER TABLE oficial_partidos
    ADD CONSTRAINT oficial_partidos_numero_ittf_chk
    CHECK (numero_ittf IS NULL OR numero_ittf > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS oficial_partidos_evento_numero_ittf_idx
  ON oficial_partidos (evento_id, numero_ittf)
  WHERE numero_ittf IS NOT NULL;

-- Árbitro básico por partido/mesa (texto libre; sin catálogo de árbitros).
ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS arbitro_nombre text;

COMMIT;
