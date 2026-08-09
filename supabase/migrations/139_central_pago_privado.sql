-- Los datos de transferencia del club dejan de ser públicos.
--
-- ── Qué estaba pasando ────────────────────────────────────────────────────
-- La imagen con el número de cuenta de cada club vivía en `galeria-fotos`, que
-- es un bucket público, en la ruta `central-pago/{club_id}`. La pantalla la
-- pedía con `getPublicUrl`, así que el archivo se abría **sin sesión** para
-- cualquiera que tuviera el enlace. Y el `club_id` no es un secreto: viaja en
-- el perfil de todo jugador del club, y aparece en cualquier consulta.
--
-- Mismo criterio que la 072 con las fotos de jugadores, la 133 con
-- `club_photos` y la 138 con `division_ranking`: si el dato es del club, no se
-- sirve por una URL que no pregunta quién sos.
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
-- ── Lo que sí hace esta migración ─────────────────────────────────────────
-- Cierra la exposición vieja: borra las filas públicas de `storage.objects`.
--
-- ⚠️ OJO, Y ES IMPORTANTE: borrar la fila hace que la URL pública deje de
-- resolver, pero **no borra los bytes** del archivo en el almacenamiento. Por
-- eso se respaldan los nombres antes: sin ese respaldo quedan huérfanos y sin
-- forma de identificarlos después. Para eliminar los bytes de verdad hay que
-- borrarlos desde el Dashboard (Storage > galeria-fotos > central-pago). Este
-- archivo no puede hacerlo: el SQL no llega al almacenamiento.
--
-- ── Y de paso: el teléfono que estaba escrito en el código ────────────────
-- La misma pantalla tenía `const WA = '56977437894'` fijo, así que los tres
-- clubes mandaban su comprobante de pago a ese número. Es de Buin. Al pasar a
-- `clubes.telefono` apareció lo incómodo: Buin era el único club sin teléfono
-- cargado, o sea que el arreglo dejaba sin botón justo al club que hasta ayer
-- funcionaba. El paso 4 mueve ese número del código a la ficha del club.
--
-- Verificado el 2026-08-09 con `node scripts/verificar-estado-cuenta.mjs`:
--   · Buin: sin teléfono            → lo carga esta migración
--   · Unión San Bernardo: +5694937228 → 8 dígitos, NO es un celular válido.
--     `telefonoWhatsApp()` lo rechaza y sus jugadores no ven el botón. Eso es
--     dato mal cargado de antes, no lo arregla esta migración: hay que
--     corregirlo desde la ficha del club (la verificación 3 lo lista).
--
-- ── Después de correrla ───────────────────────────────────────────────────
-- Cada club vuelve a subir su imagen una vez desde Central de Pago. La acción
-- ya la manda al bucket privado y de paso borra la copia pública si quedara.
-- Hasta que la suban, la pantalla muestra el estado vacío.
--
-- Al 2026-08-09 hay 3 clubes y una sola imagen cargada (la de Buin), así que
-- en la práctica es una sola resubida.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('139_central_pago_privado');


-- ══ 1. Qué hay hoy expuesto ═══════════════════════════════════════════════
-- El mismo WHERE que usa el DELETE de abajo. Al 2026-08-09 tiene que dar 1:
-- una sola imagen cargada, la de Buin. Si da otra cosa, mirar qué son antes de
-- seguir — la condición se corrige, no el comentario.
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM storage.objects
  WHERE bucket_id = 'galeria-fotos'
    AND name LIKE 'central-pago/%';

  RAISE NOTICE 'Objetos públicos de central-pago a cerrar: %', v_n;

  IF v_n > 10 THEN
    RAISE EXCEPTION 'Son % objetos, muchos más que los 4 clubes esperados. Revisar el WHERE antes de borrar.', v_n;
  END IF;
END $$;


-- ══ 2. Respaldo ═══════════════════════════════════════════════════════════
-- Nombre único y SIN `IF NOT EXISTS`, como manda docs/migraciones-destructivas.md:
-- si esto se corriera dos veces, el CREATE falla con "relation already exists"
-- y aborta la transacción antes de llegar al DELETE. El error es la protección
-- —es exactamente lo que le faltó a la 089.
-- `SELECT *` a propósito: `storage.objects` cambia de columnas entre versiones
-- de Supabase (`owner` pasó a `owner_id`), y nombrarlas acá haría que la
-- migración falle por un detalle del esquema del almacenamiento. Un respaldo,
-- además, se quiere completo.
CREATE TABLE _respaldo_central_pago_publico_20260809 AS
SELECT * FROM storage.objects
WHERE bucket_id = 'galeria-fotos'
  AND name LIKE 'central-pago/%';

COMMENT ON TABLE _respaldo_central_pago_publico_20260809 IS
  'Filas de storage.objects borradas por la migración 139. Los bytes siguen en el almacenamiento: esta tabla es la única forma de identificarlos para borrarlos desde el Dashboard.';


-- ══ 3. Cerrar la exposición ═══════════════════════════════════════════════
DELETE FROM storage.objects
WHERE bucket_id = 'galeria-fotos'
  AND name LIKE 'central-pago/%';


-- ══ 4. El teléfono que estaba escrito en el código ════════════════════════
-- Central de Pago tenía `const WA = '56977437894'` fijo, así que TODOS los
-- clubes mandaban su comprobante a ese número. Ese número es de Buin, y Buin
-- es el único club que NO lo tiene cargado en su ficha: al sacar el valor fijo
-- y pasar a `clubes.telefono`, el único club que se quedaba sin botón era
-- justo el que estaba bien atendido. Esto es mover el dato del código a la
-- base, no inventarlo.
--
-- `WHERE telefono IS NULL` para no pisar el de nadie: si alguien ya lo cargó,
-- el suyo manda.
UPDATE clubes
SET telefono = '+56977437894'
WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND nullif(btrim(coalesce(telefono, '')), '') IS NULL;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) No queda ninguna imagen de central-pago servida públicamente.
--    Tiene que dar 0.
SELECT count(*) AS deberia_ser_cero
FROM storage.objects
WHERE bucket_id = 'galeria-fotos'
  AND name LIKE 'central-pago/%';

-- 2) Lo que se respaldó, para saber qué borrar después en el Dashboard.
SELECT name, created_at
FROM _respaldo_central_pago_publico_20260809
ORDER BY name;

-- 3) Qué clubes NO le van a mostrar el botón de WhatsApp a sus jugadores.
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
       CASE WHEN length(d) >= 9 AND d LIKE '9%' THEN 'sirve'
            WHEN telefono IS NULL OR btrim(telefono) = '' THEN 'SIN TELEFONO'
            ELSE 'NO ES CELULAR CHILENO VALIDO' END AS estado_boton
FROM normalizado
WHERE NOT (length(d) >= 9 AND d LIKE '9%')
ORDER BY nombre;

-- 4) Y el estado en que quedan: cuáles ya subieron la imagen al bucket privado.
--    Recién después de que cada club la vuelva a subir, esta consulta los lista.
SELECT c.nombre,
       (o.id IS NOT NULL) AS imagen_privada_cargada
FROM clubes c
LEFT JOIN storage.objects o
  ON o.bucket_id = 'privado'
 AND o.name = 'central-pago/' || c.id::text || '/datos.jpg'
ORDER BY c.nombre;
