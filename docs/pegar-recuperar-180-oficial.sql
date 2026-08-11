-- Recuperación 180: deadlock / aplicación parcial de
-- oficial_cierre_sanciones_programa.
--
-- Pegar ESTO en Supabase SQL Editor (no usa _migracion_nueva).
-- Seguro re-ejecutar. Cerrar pestañas de la app / poco tráfico antes.
--
-- Completa: columnas tipo_cierre/motivo/alcance, tabla oficial_sanciones,
-- RLS, política staff, realtime, y marca 180 si falta.

-- ── Diagnóstico (solo lectura) ─────────────────────────────────────────────
SELECT nombre, aplicada_en
FROM _migraciones_aplicadas
WHERE nombre LIKE '180%'
ORDER BY nombre;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'oficial_partidos'
  AND column_name IN ('tipo_cierre', 'motivo_cierre', 'alcance_sancion')
ORDER BY column_name;

SELECT to_regclass('public.oficial_sanciones') AS oficial_sanciones;

SELECT pol.polname
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'oficial_sanciones';

SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'oficial_sanciones';

-- ── 1) DDL faltante ────────────────────────────────────────────────────────
BEGIN;

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

-- ── 2) Política + realtime (transacción corta) ─────────────────────────────
BEGIN;

DROP POLICY IF EXISTS oficial_sanciones_staff ON oficial_sanciones;
CREATE POLICY oficial_sanciones_staff ON oficial_sanciones
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_sanciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Marca 180 solo si falta (no llama _migracion_nueva).
INSERT INTO _migraciones_aplicadas (nombre, aplicada_por)
VALUES (
  '180_oficial_cierre_sanciones_programa',
  'recuperacion: deadlock o aplicacion parcial'
)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;

-- ── Verificación final ────────────────────────────────────────────────────
SELECT nombre, aplicada_en, aplicada_por
FROM _migraciones_aplicadas
WHERE nombre = '180_oficial_cierre_sanciones_programa';

SELECT to_regclass('public.oficial_sanciones') AS oficial_sanciones;

SELECT pol.polname
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'oficial_sanciones';
