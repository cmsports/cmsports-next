-- Cierre Jugado/W.O./Retiro, motivo+alcance, bitácora sanciones oficial.
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.
--
-- Políticas en transacción corta aparte: evita deadlock con tráfico concurrente
-- (CREATE POLICY + get_my_club_id/get_my_rol pelea con locks de ALTER/FK
-- sobre clubes/perfiles). Si el deadlock ya ocurrió con la versión anterior,
-- pegar docs/pegar-recuperar-180-oficial.sql (seguro re-ejecutar).

-- ── 1) DDL: columnas, tabla, índices, RLS ──────────────────────────────────
BEGIN;
SELECT _migracion_nueva('180_oficial_cierre_sanciones_programa');

ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS tipo_cierre text;

ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS motivo_cierre text;

ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS alcance_sancion text;

DO $$ BEGIN
  ALTER TABLE oficial_partidos
    ADD CONSTRAINT oficial_partidos_tipo_cierre_chk
    CHECK (tipo_cierre IS NULL OR tipo_cierre IN ('jugado', 'walkover', 'retiro'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE oficial_partidos
    ADD CONSTRAINT oficial_partidos_alcance_sancion_chk
    CHECK (alcance_sancion IS NULL OR alcance_sancion IN ('partido', 'evento', 'campeonato'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill desde es_walkover existente.
UPDATE oficial_partidos
SET tipo_cierre = CASE
  WHEN ganador_id IS NULL THEN NULL
  WHEN es_walkover THEN 'walkover'
  ELSE 'jugado'
END
WHERE tipo_cierre IS NULL AND ganador_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oficial_sanciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  evento_id     uuid NOT NULL REFERENCES oficial_eventos(id) ON DELETE CASCADE,
  partido_id    uuid REFERENCES oficial_partidos(id) ON DELETE SET NULL,
  inscrito_id   uuid REFERENCES oficial_inscritos(id) ON DELETE SET NULL,
  tipo          text NOT NULL
    CHECK (tipo IN ('blanca', 'amarilla', 'roja', 'descalificacion', 'otro')),
  detalle       text,
  origen        text NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('marcador', 'manual')),
  marcador_evento_id uuid,
  creado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oficial_sanciones_evento_idx
  ON oficial_sanciones (evento_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS oficial_sanciones_partido_idx
  ON oficial_sanciones (partido_id)
  WHERE partido_id IS NOT NULL;

ALTER TABLE oficial_sanciones ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── 2) Políticas + realtime (transacción corta, sin locks de DDL) ──────────
BEGIN;

DROP POLICY IF EXISTS oficial_sanciones_staff ON oficial_sanciones;
CREATE POLICY oficial_sanciones_staff ON oficial_sanciones
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_sanciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
