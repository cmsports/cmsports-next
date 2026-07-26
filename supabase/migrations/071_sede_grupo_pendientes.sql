-- Completa los 4 jugadores que la migración 070 dejó sin emparejar.
-- No calzaron por diferencias entre el padrón del profe y el nombre guardado:
--   · "Agustín Quinteros" en la base no incluye el apellido materno (Fuentes).
--   · Los otros 3 tienen el apellido repetido dentro del nombre
--     (ej. "Arturo olea reale Olea Reale"), tal como venía en la planilla.
-- Se actualiza por id, así no hay riesgo de tocar al jugador equivocado.
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- Agustín Quinteros Fuentes — MEN, ambos centros
UPDATE jugadores SET
  grupo = 'MEN', sede = 'ambos',
  nombres = 'Agustín', apellido1 = 'Quinteros', apellido2 = 'Fuentes'
WHERE id = '3905413c-b091-4129-a306-8b3e71833d6a';

-- Arturo Olea Reale — MEN, Paine
UPDATE jugadores SET
  grupo = 'MEN', sede = 'paine',
  nombres = 'Arturo', apellido1 = 'Olea', apellido2 = 'Reale'
WHERE id = 'e0f7124a-d820-4bf9-a2f0-bcaf609947be';

-- Bastian Cheuqueman Espinoza — MEN, Buin
UPDATE jugadores SET
  grupo = 'MEN', sede = 'buin',
  nombres = 'Bastian', apellido1 = 'Cheuqueman', apellido2 = 'Espinoza'
WHERE id = 'd0791631-f5c7-49dc-85e1-828b7cbea10d';

-- Matías Muñoz Rojas — ADU, ambos centros
UPDATE jugadores SET
  grupo = 'ADU', sede = 'ambos',
  nombres = 'Matías', apellido1 = 'Muñoz', apellido2 = 'Rojas'
WHERE id = 'daa7bd49-4d77-475a-b511-c951fa99ba51';


-- ── OPCIONAL: limpiar el apellido repetido en el nombre visible ────────────
-- Estos 3 se muestran con el apellido duplicado en toda la app (listados,
-- informes, torneos). Descomentá el bloque si querés dejarlos parejos.
-- Ojo: cambia el nombre que ve todo el mundo, revisá que sea lo que esperás.
--
-- UPDATE jugadores SET nombre = 'Arturo Olea Reale'
--   WHERE id = 'e0f7124a-d820-4bf9-a2f0-bcaf609947be';
-- UPDATE jugadores SET nombre = 'Bastian Cheuqueman Espinoza'
--   WHERE id = 'd0791631-f5c7-49dc-85e1-828b7cbea10d';
-- UPDATE jugadores SET nombre = 'Matías Muñoz Rojas'
--   WHERE id = 'daa7bd49-4d77-475a-b511-c951fa99ba51';

COMMIT;

-- Verificación: los 106 deberían quedar con grupo y sede.
SELECT
  count(*)                                    AS total,
  count(*) FILTER (WHERE grupo IS NOT NULL)   AS con_grupo,
  count(*) FILTER (WHERE sede  IS NOT NULL)   AS con_sede
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (es_externo IS NULL OR es_externo = false);
