-- Datos personales (fotos de jugadores y contratos firmados) pasan a un bucket
-- privado. Hasta ahora vivían en `galeria-fotos`, que es público: cualquiera
-- con el enlace podía abrir el archivo sin iniciar sesión, y la mayoría de los
-- jugadores son menores de edad.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- No hay que crear nada a mano: el bucket se crea acá abajo.

BEGIN;

-- Bucket privado (public = false). Si ya existe, no se toca.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('privado', 'privado', false, 10485760)   -- 10 MB por archivo
ON CONFLICT (id) DO NOTHING;

-- Se guarda la ruta dentro del bucket, no una URL: los enlaces del bucket
-- privado se firman al momento de mostrarlos y vencen solos.
ALTER TABLE jugadores          ADD COLUMN IF NOT EXISTS foto_path    text;
ALTER TABLE jugador_documentos ADD COLUMN IF NOT EXISTS archivo_path text;

COMMIT;


-- ============================================================
-- Permisos del bucket privado
-- ============================================================
-- Las fotos las ve todo el club; los documentos también (lo pidió el profe),
-- pero nadie de afuera puede tocar nada aunque tenga el enlace.

DROP POLICY IF EXISTS "privado_lectura_club" ON storage.objects;
CREATE POLICY "privado_lectura_club" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'privado'
    AND (storage.foldername(name))[2] = (
      SELECT club_id::text FROM public.perfiles WHERE id = auth.uid()
    )
  );

-- Solo el staff sube y borra. El jugador sube sus documentos vía Server Action
-- (que usa la service key), así que no necesita permiso directo acá.
DROP POLICY IF EXISTS "privado_escritura_staff" ON storage.objects;
CREATE POLICY "privado_escritura_staff" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'privado'
    AND (storage.foldername(name))[2] = (
      SELECT club_id::text FROM public.perfiles WHERE id = auth.uid()
    )
    AND (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    bucket_id = 'privado'
    AND (storage.foldername(name))[2] = (
      SELECT club_id::text FROM public.perfiles WHERE id = auth.uid()
    )
    AND (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'superadmin', 'profesor')
  );
