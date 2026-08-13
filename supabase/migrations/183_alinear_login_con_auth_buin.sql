-- El informe y el lookup mostraban el @cmsports.cl del reset masivo, pero Auth
-- ya tenía el correo de la ficha (gmail/hotmail de apoderado). El jugador
-- copiaba el usuario del link y el login decía credenciales incorrectas.
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('183_alinear_login_con_auth_buin');

UPDATE credencial_visible cv
SET usuario_login = p.email,
    tipo_login = 'email'
FROM perfiles p
WHERE cv.usuario_id = p.id
  AND cv.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND p.club_id = cv.club_id
  AND p.rol = 'jugador'
  AND p.email IS NOT NULL
  AND position('@' in p.email) > 0
  AND lower(trim(cv.usuario_login)) <> lower(trim(p.email));

-- El lookup público mira el correo de Auth (espejado en perfiles), no el
-- usuario viejo que quedó en el reporte.
CREATE OR REPLACE FUNCTION public.consultar_credencial_por_rut(
  p_club_id uuid,
  p_rut text
)
RETURNS TABLE(
  encontrado boolean,
  limitado boolean,
  nombre text,
  usuario_login text,
  password_plano text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rut text := regexp_replace(lower(COALESCE(p_rut, '')), '[^0-9k]', '', 'g');
  v_n integer;
  v_jugador_id uuid;
  v_nombre text;
  v_login text;
  v_password text;
BEGIN
  IF p_club_id IS NULL OR length(v_rut) < 8 OR length(v_rut) > 9 THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT public._consumir_limite_publico('credencial-club', p_club_id::text, 120, 60)
     OR NOT public._consumir_limite_publico('credencial-rut', p_club_id::text || ':' || v_rut, 8, 600) THEN
    RETURN QUERY SELECT false, true, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.jugadores j
  WHERE j.club_id = p_club_id
    AND COALESCE(j.es_externo, false) = false
    AND regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = v_rut;

  IF v_n <> 1 THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT j.id, j.nombre INTO v_jugador_id, v_nombre
  FROM public.jugadores j
  WHERE j.club_id = p_club_id
    AND COALESCE(j.es_externo, false) = false
    AND regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = v_rut
  LIMIT 1;

  SELECT
    CASE
      WHEN p.email IS NOT NULL AND position('@' in p.email) > 0 THEN p.email
      ELSE cv.usuario_login
    END,
    cv.password_plano
    INTO v_login, v_password
  FROM public.perfiles p
  JOIN public.credencial_visible cv
    ON cv.usuario_id = p.id AND cv.club_id = p.club_id
  WHERE p.jugador_id = v_jugador_id
    AND p.club_id = p_club_id
    AND p.rol = 'jugador'
    AND cv.password_plano IS NOT NULL
    AND length(cv.password_plano) > 0
  LIMIT 1;

  IF v_login IS NULL OR v_password IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, false, v_nombre, v_login, v_password;
END;
$$;

REVOKE ALL ON FUNCTION public.consultar_credencial_por_rut(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultar_credencial_por_rut(uuid, text) TO anon, authenticated;

COMMIT;
