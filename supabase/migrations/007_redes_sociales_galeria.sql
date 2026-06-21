-- ============================================================
-- CmSports — Galería de referencias y fotos para Redes Sociales
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo
--   3. Haz clic en "Run"
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabla: flyer_referencias
-- Banco de flyers "ganadores" (hechos en Canva u otra herramienta)
-- que sirven de referencia visual para la IA al generar uno nuevo.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flyer_referencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  url text NOT NULL,
  nombre text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flyer_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flyer_referencias_select" ON flyer_referencias;
CREATE POLICY "flyer_referencias_select" ON flyer_referencias
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "flyer_referencias_admin_all" ON flyer_referencias;
CREATE POLICY "flyer_referencias_admin_all" ON flyer_referencias
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ────────────────────────────────────────────────────────────
-- 2. Tabla: fotos_galeria
-- Fotos reales del club (jugadores, canchas, equipo) para insertar
-- en los flyers generados, en vez de fotos de stock.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fotos_galeria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  url text NOT NULL,
  tipo text NOT NULL DEFAULT 'jugador' CHECK (tipo IN ('jugador', 'cancha', 'equipo', 'otro')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fotos_galeria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fotos_galeria_select" ON fotos_galeria;
CREATE POLICY "fotos_galeria_select" ON fotos_galeria
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "fotos_galeria_admin_all" ON fotos_galeria;
CREATE POLICY "fotos_galeria_admin_all" ON fotos_galeria
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ────────────────────────────────────────────────────────────
-- 3. Storage: buckets públicos para lectura, escritura solo admin
-- Estructura de carpetas: {club_id}/{uuid}.{ext}
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('flyer-referencias', 'flyer-referencias', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('galeria-fotos', 'galeria-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "flyer_referencias_storage_select" ON storage.objects;
CREATE POLICY "flyer_referencias_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'flyer-referencias');

DROP POLICY IF EXISTS "flyer_referencias_storage_admin_write" ON storage.objects;
CREATE POLICY "flyer_referencias_storage_admin_write" ON storage.objects
  FOR ALL USING (
    bucket_id = 'flyer-referencias'
    AND (storage.foldername(name))[1] = get_my_club_id()::text
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'flyer-referencias'
    AND (storage.foldername(name))[1] = get_my_club_id()::text
    AND get_my_rol() = 'admin'
  );

DROP POLICY IF EXISTS "galeria_fotos_storage_select" ON storage.objects;
CREATE POLICY "galeria_fotos_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'galeria-fotos');

DROP POLICY IF EXISTS "galeria_fotos_storage_admin_write" ON storage.objects;
CREATE POLICY "galeria_fotos_storage_admin_write" ON storage.objects
  FOR ALL USING (
    bucket_id = 'galeria-fotos'
    AND (storage.foldername(name))[1] = get_my_club_id()::text
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'galeria-fotos'
    AND (storage.foldername(name))[1] = get_my_club_id()::text
    AND get_my_rol() = 'admin'
  );

-- ============================================================
-- DONE!
-- ============================================================
