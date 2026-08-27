-- ────────────────────────────────────────────────────────────
-- La bibliografía y el libro del profe son de Buin, están en buckets PÚBLICOS
-- y los ve cualquier usuario autenticado de cualquier club.
--
-- ── El defecto ────────────────────────────────────────────────────────────
-- Los cuatro endpoints (src/app/api/bibliografia/*, src/app/api/libro-profe/*)
-- tienen el bucket escrito a mano:
--
--     const BUCKET = 'bibliografia-buin'
--     const BUCKET = 'libro-profe-buin'
--
-- y se saltan RLS con `createAdminClient()`. Su única comprobación de acceso
-- es «hay sesión»: nunca miran a qué club pertenece quien pregunta. Con
-- Demostración TDM, Unión San Bernardo y Paine en la misma base, cualquiera de
-- sus usuarios lista y abre el material de Buin.
--
-- Y como los buckets son públicos, la URL que devuelven no caduca ni exige
-- sesión: una vez copiada, sirve para siempre y para cualquiera.
--
-- Va justo en contra de la regla del proyecto —«toda consulta o migración debe
-- filtrar por club»— y justo cuando se vienen clubes nuevos.
--
-- ── Qué hace esta migración y qué hace el código ──────────────────────────
-- Se reparte en dos, a propósito:
--
--   ACÁ: los buckets pasan a PRIVADOS, con tope de tamaño y lista de tipos
--   permitidos. Eso invalida las URL públicas que hubiera circulando y obliga
--   a que todo acceso pase por una URL firmada que caduca.
--
--   EN EL CÓDIGO: los endpoints pasan a subir en `{club_id}/{archivo}`, a
--   listar solo la carpeta del club de quien pregunta, y a devolver URL
--   firmadas en vez de públicas.
--
-- ── Por qué NO se mueven los archivos que ya están ────────────────────────
-- Los archivos históricos viven en la raíz del bucket. La tentación es
-- moverlos con `UPDATE storage.objects SET name = 'ec1ef.../' || name`, y sería
-- un error: en Supabase la ruta física del archivo en S3 se deriva del `name`,
-- así que renombrarlo por SQL deja la fila apuntando a un archivo que no está
-- ahí. Se rompen todas las descargas y no hay forma cómoda de volver.
--
-- Se resuelve en el código: la raíz del bucket se trata como carpeta de Buin
-- (que es de quien son), y todo lo nuevo nace bajo su `club_id`. Cuando el
-- club quiera, los archivos viejos se mueven UNA vez desde la propia interfaz
-- de Storage, que sí mueve el objeto de verdad.
--
-- No borra ni un archivo ni una fila.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
--
-- ⚠️ ORDEN OBLIGATORIO: esta migración va DESPUÉS de desplegar el código que
--    firma las URL. Al revés, el libro y la bibliografía quedan en blanco
--    hasta que el despliegue termine (la URL pública deja de servir en el
--    momento del COMMIT).

BEGIN;
SELECT _migracion_nueva('230_bibliografia_y_libro_privados');

-- ══ 1. Estado antes, para poder comparar ══════════════════════════════════
DO $$
DECLARE b record; v_encontrados integer := 0;
BEGIN
  FOR b IN
    SELECT id, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id IN ('bibliografia-buin', 'libro-profe-buin')
  LOOP
    v_encontrados := v_encontrados + 1;
    RAISE NOTICE 'Bucket % → público: %, tope: %, tipos: %',
      b.id, b.public, b.file_size_limit, b.allowed_mime_types;
  END LOOP;

  IF v_encontrados = 0 THEN
    RAISE NOTICE 'Ninguno de los dos buckets existe en esta base: nada que cerrar.';
  END IF;
END $$;

-- ══ 2. Privados, con tope y tipos ═════════════════════════════════════════
-- 10 MB es el mismo tope que la 040 le puso a flyer-referencias y galeria-fotos.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'bibliografia-buin';

-- El libro es un PDF y solo uno.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'libro-profe-buin';

-- ══ 3. Cerrar cualquier política que los dejara leer sin sesión ═══════════
-- Los cuatro endpoints usan la llave de servicio, que se salta RLS, así que
-- ninguna política hace falta para que sigan funcionando. Lo que sí importa
-- es que no quede una vieja que permita leer directo desde el navegador.
-- Se borran por nombre real, sin adivinar: mismo patrón que la 096 y la 198.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%bibliografia-buin%' OR with_check ILIKE '%bibliografia-buin%'
        OR qual ILIKE '%libro-profe-buin%'  OR with_check ILIKE '%libro-profe-buin%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'Política de storage eliminada: %', pol.policyname;
  END LOOP;
END $$;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Los dos privados y con límites: public = false en ambos.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('bibliografia-buin', 'libro-profe-buin');

-- 2) Ninguna política de storage los menciona ya: cero filas.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual ILIKE '%bibliografia%' OR qual ILIKE '%libro-profe%');

-- 3) Qué archivos quedaron en la raíz (los que la aplicación va a tratar como
--    de Buin hasta que alguien los mueva a mano desde el panel de Storage).
SELECT bucket_id, name, created_at
FROM storage.objects
WHERE bucket_id IN ('bibliografia-buin', 'libro-profe-buin')
  AND name NOT LIKE '%/%'
ORDER BY bucket_id, created_at DESC;

-- 4) Y la prueba que de verdad importa, fuera de SQL: pegar en una ventana
--    de incógnito la URL pública de cualquiera de esos archivos
--    (…/storage/v1/object/public/bibliografia-buin/ARCHIVO).
--    Antes de esta migración devolvía el archivo. Ahora tiene que devolver 400.
