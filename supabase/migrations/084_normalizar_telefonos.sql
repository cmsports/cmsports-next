-- Deja todos los teléfonos en un solo formato: +569XXXXXXXX.
--
-- Hoy están cargados de quince maneras distintas, todas legítimas para un ojo
-- humano y ninguna para WhatsApp:
--
--   +56978408170      974073161        56999014018      9 84605077
--   569 20401524      9-45301381       ±56988158583     +56 9897 4678 4
--   937222133 - 959493845             +56962218144 / +56962218145
--   974005738(mamá) Karen Altamirano  Ingrid Reale      -
--
-- La regla es la misma que aplica el botón de WhatsApp en la página, así que
-- lo que se ve y lo que se guarda no se pueden contradecir:
--
--   1. Se sacan todos los símbolos y letras.
--   2. Se quitan los prefijos 00, 56 y el 0 de larga distancia.
--   3. Si lo que queda arranca en 9 y tiene nueve dígitos o más, se toman los
--      primeros nueve. El resto sobra: son los campos con dos números pegados.
--   4. Si no arranca en 9 no se toca. Un fijo no sirve para WhatsApp y
--      recortarlo sería inventar un número que le llega a otra persona.
--
-- Los contactos de emergencia que traen un nombre en vez de un número
-- —"Ingrid Reale", "Marcela Pino"— se pasan al campo de nombre, que es donde
-- correspondía, y el teléfono queda vacío.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. La regla, como función de la base ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalizar_movil_cl(txt text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;

  d := regexp_replace(txt, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;

  d := regexp_replace(d, '^00', '');
  d := regexp_replace(d, '^56', '');
  d := regexp_replace(d, '^0',  '');

  IF length(d) >= 9 AND left(d, 1) = '9' THEN
    RETURN '+56' || left(d, 9);
  END IF;

  RETURN NULL;
END;
$$;

-- ── 2. Antes de tocar nada, una copia ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS _respaldo_telefonos_084 AS
SELECT id, nombre, telefono, contacto_emergencia_nombre, contacto_emergencia_telefono,
       now() AS respaldado_en
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- ── 3. El nombre que quedó escrito en el campo del teléfono ───────────────
-- Solo cuando no hay número que rescatar y el campo del nombre está vacío:
-- no se pisa un nombre ya cargado.
UPDATE jugadores SET
  contacto_emergencia_nombre = btrim(contacto_emergencia_telefono)
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND contacto_emergencia_telefono IS NOT NULL
  AND btrim(contacto_emergencia_telefono) <> ''
  AND public.normalizar_movil_cl(contacto_emergencia_telefono) IS NULL
  AND contacto_emergencia_telefono ~ '[A-Za-zÁÉÍÓÚÑáéíóúñ]'
  AND coalesce(btrim(contacto_emergencia_nombre), '') = '';

-- ── 4. Normalizar ─────────────────────────────────────────────────────────
-- Lo que la función no reconoce queda en NULL: es preferible que el botón de
-- WhatsApp no aparezca a que abra un chat con un número equivocado.
UPDATE jugadores SET
  telefono                     = public.normalizar_movil_cl(telefono),
  contacto_emergencia_telefono = public.normalizar_movil_cl(contacto_emergencia_telefono)
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

COMMIT;


-- ── Verificación 1: cuántos quedaron utilizables ──────────────────────────
SELECT
  count(*)                                                  AS jugadores,
  count(telefono)                                           AS con_telefono,
  count(contacto_emergencia_telefono)                       AS con_emergencia,
  count(*) FILTER (WHERE telefono IS NULL)                  AS sin_telefono
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND estado = 'activo' AND (es_externo IS NULL OR es_externo = false);


-- ── Verificación 2: los que se perdieron por el camino ────────────────────
-- Tenían algo escrito y no era un móvil chileno. Hay que mirarlos a mano.
SELECT r.nombre,
       r.telefono                     AS telefono_antes,
       r.contacto_emergencia_telefono AS emergencia_antes,
       j.contacto_emergencia_nombre   AS nombre_emergencia_ahora
FROM _respaldo_telefonos_084 r
JOIN jugadores j ON j.id = r.id
WHERE (r.telefono IS NOT NULL AND btrim(r.telefono) <> '' AND j.telefono IS NULL)
   OR (r.contacto_emergencia_telefono IS NOT NULL
       AND btrim(r.contacto_emergencia_telefono) <> ''
       AND j.contacto_emergencia_telefono IS NULL)
ORDER BY r.nombre;
