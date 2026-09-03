-- ════════════════════════════════════════════════════════════════════════
-- DEMO: perfil deportivo cargado en 10 jugadores de Spinhouse
--
-- Para mostrarle la ficha a Cristhian con datos plausibles en vez de campos
-- vacíos. NO es una migración: no toca el esquema, no lleva número y no se
-- registra en `_migraciones_aplicadas`. Es un seed de demostración.
--
-- ── Qué escribe, y por qué es seguro ───────────────────────────────────
--
-- Solo las cinco columnas que creó la 254: nivel, mano_habil, estilo_juego,
-- material y licencia_fechiteme. Hoy están en NULL en el 100% de las fichas de
-- todos los clubes, así que **esto no puede pisar ningún dato existente**. Lo
-- peor que puede pasar es que quede escrito algo que no era, y el PASO 4 lo
-- borra dejándolas como estaban.
--
-- No toca nombre, RUT, teléfono, mensualidad, estado ni nada que importe.
--
-- ⚠️ CORRÉ LOS PASOS DE A UNO, no todo junto. El paso 1 te muestra a QUIÉNES
-- les va a tocar, y ahí decidís si seguís. Yo no pude verificar cuáles de los
-- jugadores de Spinhouse son sembrados y cuáles podrían ser reales — esa
-- comprobación la hacés vos mirando la lista del paso 1.
-- ════════════════════════════════════════════════════════════════════════


-- ══ PASO 1 ══ Quiénes son los 10. Mirá la lista ANTES de seguir. ═════════
--
-- Elige los 10 primeros por nombre, entre los activos que todavía no tienen
-- perfil deportivo. Determinista: el paso 2 le pega exactamente a estos.

SELECT row_number() OVER (ORDER BY j.nombre) AS n,
       j.nombre,
       j.email,
       j.fecha_nacimiento,
       j.estado
FROM public.jugadores j
JOIN public.clubes c ON c.id = j.club_id
WHERE c.nombre ILIKE '%spinhouse%'
  AND j.estado = 'activo'
  AND COALESCE(j.es_externo, false) = false
  AND j.nivel IS NULL
  AND j.mano_habil IS NULL
ORDER BY j.nombre
LIMIT 10;


-- ══ PASO 2 ══ Escribir los datos ════════════════════════════════════════
--
-- Los valores salen de un CASE por posición, no de random(): así el resultado
-- es el mismo si lo corrés dos veces, y podés contarle a Cristhian por qué
-- cada uno tiene lo que tiene sin que la próxima vez diga otra cosa.
--
-- La mezcla es deliberada: 4 competitivos, 3 intermedios, 3 de iniciación;
-- 7 diestros y 3 zurdos (que es más o menos la proporción real); y solo los
-- competitivos llevan licencia FECHITEME, porque son los que compiten
-- federado. Un club donde los 10 tienen licencia se ve inventado.

BEGIN;

WITH elegidos AS (
  SELECT j.id,
         row_number() OVER (ORDER BY j.nombre) AS n
  FROM public.jugadores j
  JOIN public.clubes c ON c.id = j.club_id
  WHERE c.nombre ILIKE '%spinhouse%'
    AND j.estado = 'activo'
    AND COALESCE(j.es_externo, false) = false
    AND j.nivel IS NULL
    AND j.mano_habil IS NULL
  ORDER BY j.nombre
  LIMIT 10
)
UPDATE public.jugadores j
SET
  nivel = CASE e.n
    WHEN 1 THEN 'competitivo' WHEN 2 THEN 'intermedio'  WHEN 3 THEN 'iniciacion'
    WHEN 4 THEN 'competitivo' WHEN 5 THEN 'intermedio'  WHEN 6 THEN 'iniciacion'
    WHEN 7 THEN 'competitivo' WHEN 8 THEN 'intermedio'  WHEN 9 THEN 'iniciacion'
    ELSE 'competitivo' END,

  mano_habil = CASE WHEN e.n IN (3, 6, 9) THEN 'zurdo' ELSE 'diestro' END,

  estilo_juego = CASE e.n
    WHEN 1 THEN 'Ofensivo de derecha, juego de contraataque'
    WHEN 2 THEN 'Todocampo, prioriza el bloqueo activo'
    WHEN 3 THEN 'En formación, trabajando el saque y la devolución'
    WHEN 4 THEN 'Penholder chino, fuerte en el tercer golpe'
    WHEN 5 THEN 'Defensivo con corte de revés, busca alargar el punto'
    WHEN 6 THEN 'En formación, afirmando el golpe de derecha'
    WHEN 7 THEN 'Ofensivo de dos alas, muy agresivo en la apertura'
    WHEN 8 THEN 'Todocampo, cómodo a media distancia'
    WHEN 9 THEN 'En formación, trabajando el desplazamiento'
    ELSE 'Ofensivo de revés, busca el punto corto' END,

  material = CASE e.n
    WHEN 1 THEN 'Butterfly Viscaria · Tenergy 05 (D) / Tenergy 64 (R)'
    WHEN 2 THEN 'Stiga Allround Classic · Mantra M (D) / Mantra M (R)'
    WHEN 3 THEN 'Raqueta de iniciación del club'
    WHEN 4 THEN 'DHS Hurricane Long 5 · Hurricane 3 (D) / Tenergy 05 (R)'
    WHEN 5 THEN 'Donic Defplay · Baracuda (D) / Pupo largo Feint (R)'
    WHEN 6 THEN 'Raqueta de iniciación del club'
    WHEN 7 THEN 'Butterfly Timo Boll ALC · Dignics 09C (D) / Rozena (R)'
    WHEN 8 THEN 'Yasaka Sweden Extra · Rakza 7 (D) / Rakza 7 Soft (R)'
    WHEN 9 THEN 'Raqueta de iniciación del club'
    ELSE 'Xiom Ice Cream AZXi · Omega VII Pro (D) / Vega Pro (R)' END,

  -- Solo los competitivos. Formato inventado y evidente (empieza en 9), para
  -- que nadie confunda estos números con licencias reales de la federación.
  licencia_fechiteme = CASE e.n
    WHEN 1 THEN '9-24187' WHEN 4 THEN '9-24219'
    WHEN 7 THEN '9-24263' WHEN 10 THEN '9-24291'
    ELSE NULL END

FROM elegidos e
WHERE j.id = e.id;

COMMIT;


-- ══ PASO 3 ══ Cómo quedaron ═════════════════════════════════════════════

SELECT j.nombre, j.nivel, j.mano_habil, j.licencia_fechiteme, j.estilo_juego, j.material
FROM public.jugadores j
JOIN public.clubes c ON c.id = j.club_id
WHERE c.nombre ILIKE '%spinhouse%'
  AND j.nivel IS NOT NULL
ORDER BY j.nombre;


-- ══ PASO 4 ══ Deshacer, si no te gustó ══════════════════════════════════
--
-- Deja las cinco columnas como estaban. No hace falta correrlo si todo bien.
--
-- UPDATE public.jugadores j
-- SET nivel = NULL, mano_habil = NULL, estilo_juego = NULL,
--     material = NULL, licencia_fechiteme = NULL
-- FROM public.clubes c
-- WHERE c.id = j.club_id AND c.nombre ILIKE '%spinhouse%';


-- ══ Comprobación de que Buin no se movió ════════════════════════════════
-- Tiene que dar 0.
--
-- SELECT count(*) FROM public.jugadores j
-- JOIN public.clubes c ON c.id = j.club_id
-- WHERE c.nombre = 'Asociación TDM Buin y Paine'
--   AND (j.nivel IS NOT NULL OR j.mano_habil IS NOT NULL);
