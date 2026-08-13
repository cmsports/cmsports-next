-- Corrige el dígito verificador de 3 RUT de Asociación TDM Buin y Paine.
-- No destructivo: UPDATE acotado al club y al RUT mal cargado.
-- Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('182_corregir_rut_dv_buin');

-- Alan máximo Imilqueo Altamirano: 23208195-7 → 23208195-3
UPDATE jugadores
SET rut = '23208195-3'
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND regexp_replace(upper(coalesce(rut, '')), '[^0-9K]', '', 'g') = '232081957'
  AND NOT EXISTS (
    SELECT 1 FROM jugadores o
    WHERE o.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
      AND o.id <> jugadores.id
      AND regexp_replace(upper(coalesce(o.rut, '')), '[^0-9K]', '', 'g') = '232081953'
  );

-- Randy Leonardo Rivera Morales: 2405786-K → 2405786-0
UPDATE jugadores
SET rut = '2405786-0'
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND regexp_replace(upper(coalesce(rut, '')), '[^0-9K]', '', 'g') = '2405786K'
  AND NOT EXISTS (
    SELECT 1 FROM jugadores o
    WHERE o.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
      AND o.id <> jugadores.id
      AND regexp_replace(upper(coalesce(o.rut, '')), '[^0-9K]', '', 'g') = '24057860'
  );

-- VICTOR SOTO: 17168286-1 → 17168286-K
UPDATE jugadores
SET rut = '17168286-K'
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND regexp_replace(upper(coalesce(rut, '')), '[^0-9K]', '', 'g') = '171682861'
  AND NOT EXISTS (
    SELECT 1 FROM jugadores o
    WHERE o.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
      AND o.id <> jugadores.id
      AND regexp_replace(upper(coalesce(o.rut, '')), '[^0-9K]', '', 'g') = '17168286K'
  );

COMMIT;
