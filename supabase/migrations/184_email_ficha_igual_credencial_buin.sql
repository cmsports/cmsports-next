-- Copia el usuario de la credencial al email de la ficha, para que queden iguales.
-- Asociación TDM Buin y Paine. No toca Auth (eso no se puede desde SQL).
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('184_email_ficha_igual_credencial_buin');

UPDATE jugadores j
SET email = cv.usuario_login
FROM perfiles p
JOIN credencial_visible cv
  ON cv.usuario_id = p.id AND cv.club_id = p.club_id
WHERE j.id = p.jugador_id
  AND j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND p.club_id = j.club_id
  AND p.rol = 'jugador'
  AND COALESCE(j.es_externo, false) = false
  AND cv.usuario_login IS NOT NULL
  AND position('@' in cv.usuario_login) > 0
  AND lower(trim(coalesce(j.email, ''))) IS DISTINCT FROM lower(trim(cv.usuario_login));

COMMIT;
