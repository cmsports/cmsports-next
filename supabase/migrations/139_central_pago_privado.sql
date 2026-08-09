-- Los datos de transferencia del club dejan de ser públicos.
--
-- ── Qué estaba pasando ────────────────────────────────────────────────────
-- La imagen con el número de cuenta de cada club vivía en `galeria-fotos`, que
-- es un bucket público, en la ruta `central-pago/{club_id}`. La pantalla la
-- pedía con `getPublicUrl`, así que el archivo se abría **sin sesión** para
-- cualquiera que tuviera el enlace. Y el `club_id` no es un secreto: viaja en
-- el perfil de todo jugador del club, y aparece en cualquier consulta.
--
-- Comprobado el 2026-08-09 contra producción: la imagen de Buin se descarga
-- sin sesión, 146 KB.
--
-- Mismo criterio que la 072 con las fotos de jugadores, la 133 con
-- `club_photos` y la 138 con `division_ranking`: si el dato es del club, no se
-- sirve por una URL que no pregunta quién sos.
--
-- ── POR QUÉ ESTE ARCHIVO NO MUEVE LOS ARCHIVOS ────────────────────────────
-- La primera versión de esta migración hacía `DELETE FROM storage.objects`.
-- La base lo rechazó, y con razón:
--
--   ERROR 42501: no se permite la eliminación directa de tablas de
--   almacenamiento. Utilice la API de almacenamiento en su lugar.
--   SUGERENCIA: esto evita la pérdida accidental de datos de objetos huérfanos.
--   CONTEXTO: función PL/pgSQL storage.protect_delete()
--
-- Supabase protege `storage.objects` justo contra lo que esa versión iba a
-- hacer: borrar la fila y dejar el archivo huérfano en el disco, sin la fila
-- que permitía encontrarlo. El trigger tenía razón y el archivo estaba mal.
--
-- Mover los archivos va por la API de almacenamiento:
--
--     node scripts/migrar-central-pago-a-privado.mjs            (simulacro)
--     node scripts/migrar-central-pago-a-privado.mjs --borrar   (de verdad)
--
-- Ese script descarga la imagen pública, la sube al bucket privado, verifica
-- que la copia se lee y recién entonces borra la pública. El club no pierde su
-- imagen ni tiene que volver a subirla.
--
-- ── Por qué NO hace falta una política nueva ──────────────────────────────
-- El bucket `privado` de la 072 decide por la segunda carpeta de la ruta:
--
--   USING (bucket_id = 'privado' AND (storage.foldername(name))[2] = <mi club>)
--
-- La ruta nueva es `central-pago/{club_id}/datos.jpg`, así que `foldername[2]`
-- es el club y la política existente ya la cubre: la lee cualquier autenticado
-- de ese club —incluido el jugador, que es quien la necesita para pagar— y
-- nadie de afuera. El bucket ya existe; acá no se crea nada.
--
-- ── Entonces qué hace este archivo ────────────────────────────────────────
-- Una sola cosa que sí es de la base: mover a la ficha del club el teléfono
-- que estaba escrito en el código.
--
-- Central de Pago tenía `const WA = '56977437894'` fijo, así que los tres
-- clubes mandaban su comprobante de pago a ese número. Es de Buin. Al pasar a
-- `clubes.telefono` apareció lo incómodo: Buin era el único club sin teléfono
-- cargado, o sea que el arreglo dejaba sin botón justo al club que hasta ayer
-- funcionaba.
--
-- Verificado el 2026-08-09 con `node scripts/verificar-estado-cuenta.mjs`:
--   · Buin: sin teléfono              → lo carga esta migración
--   · Unión San Bernardo: +5694937228 → 8 dígitos, NO es un celular válido.
--     `telefonoWhatsApp()` lo rechaza y sus jugadores no ven el botón. Eso es
--     dato mal cargado de antes y no lo toca esta migración: hay que
--     corregirlo desde la ficha del club (la verificación 2 lo lista).
--
-- No lleva respaldo porque no borra nada: el UPDATE solo escribe donde hoy
-- hay NULL, así que no hay valor previo que perder.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('139_central_pago_privado');


-- ══ El teléfono que estaba escrito en el código ═══════════════════════════
-- `WHERE telefono IS NULL` para no pisar el de nadie: si alguien ya lo cargó,
-- el suyo manda. Esto es mover el dato del código a la base, no inventarlo.
UPDATE clubes
SET telefono = '+56977437894'
WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nullif(btrim(coalesce(telefono, '')), '') IS NULL;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Buin tiene que quedar con su teléfono cargado.
SELECT id, nombre, telefono
FROM clubes
WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- 2) Qué clubes NO le van a mostrar el botón de WhatsApp a sus jugadores.
--
--    No alcanza con preguntar si el teléfono está vacío: `telefonoWhatsApp()`
--    (src/lib/whatsapp.ts) exige un celular chileno de 9 dígitos que empiece
--    en 9, y devuelve null si no. Un número mal cargado da exactamente el mismo
--    resultado que ninguno, así que la verificación replica esa regla. Buin
--    tiene que salir de esta lista después del UPDATE de arriba.
WITH normalizado AS (
  SELECT id, nombre, telefono,
         regexp_replace(
           regexp_replace(
             regexp_replace(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'),
                            '^00', ''),
             '^56', ''),
           '^0', '') AS d
  FROM clubes
)
SELECT id, nombre, telefono,
       CASE WHEN telefono IS NULL OR btrim(telefono) = '' THEN 'SIN TELEFONO'
            ELSE 'NO ES CELULAR CHILENO VALIDO' END AS estado_boton
FROM normalizado
WHERE NOT (length(d) >= 9 AND d LIKE '9%')
ORDER BY nombre;

-- 3) Inventario de los archivos, para correr ANTES y DESPUÉS del script.
--    Leer `storage.objects` sí se puede; lo que la base impide es escribirla.
--    Antes del script: Buin en 'galeria-fotos' (público).
--    Después:          Buin en 'privado', y nada en 'galeria-fotos'.
SELECT c.nombre,
       o.bucket_id,
       o.name,
       (o.metadata->>'size')::bigint AS bytes
FROM clubes c
JOIN storage.objects o
  ON (o.bucket_id = 'galeria-fotos' AND o.name = 'central-pago/' || c.id::text)
  OR (o.bucket_id = 'privado'       AND o.name = 'central-pago/' || c.id::text || '/datos.jpg')
ORDER BY c.nombre, o.bucket_id;
