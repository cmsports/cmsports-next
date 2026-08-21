-- ────────────────────────────────────────────────────────────
-- consultar_credencial_por_rut deja de ser consultable indefinidamente.
--
-- La 180 abrió esta función a `anon` para que el club mande un solo link de
-- WhatsApp y cada jugador vea su propia clave con su RUT. El diseño evita
-- filtrar si un RUT existe o está duplicado, y tiene rate-limiting. Pero en
-- Chile el RUT no es secreto: cualquiera que lo tenga puede pedir la
-- contraseña de otra persona, indefinidamente, sin loguearse. Con la
-- mayoría del padrón siendo menores de edad, y la ley de protección de
-- datos personales entrando en vigor el 1 de diciembre de 2026, esa ventana
-- de exposición permanente no es defendible.
--
-- Esta migración no cierra la función: la limita a una sola consulta exitosa
-- por credencial. Después de la primera vez que alguien la usa para ver su
-- clave, `primera_consulta_rut_en` queda marcada y la función deja de
-- devolver esa contraseña — como si nunca hubiera existido para ese RUT.
-- Para recuperar el acceso después de eso, hay que pasar por el botón de
-- reseteo del admin, que ya existe.
--
-- Ojo: la clave sigue viva en `credencial_visible.password_plano` para que
-- la pantalla de impresión del admin (/credenciales) la siga mostrando. Esta
-- migración NO toca esa columna ni esa pantalla, solo la vía de RUT público.
--
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('205_rut_consulta_una_sola_vez');

ALTER TABLE credencial_visible
  ADD COLUMN IF NOT EXISTS primera_consulta_rut_en timestamptz;

COMMENT ON COLUMN credencial_visible.primera_consulta_rut_en IS
  'Cuándo se usó consultar_credencial_por_rut para ver esta clave por primera vez. No NULL = la vía de RUT público ya no la devuelve más; queda solo el botón de reseteo del admin.';

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
  v_usuario_id uuid;
  v_login text;
  v_password text;
BEGIN
  -- Sin excepción: un RAISE acá revertiría el contador de intentos.
  IF p_club_id IS NULL OR length(v_rut) < 8 OR length(v_rut) > 9 THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 120/min por club: el grupo de WhatsApp entra de a muchos juntos.
  -- 8 cada 10 min por RUT: frena a quien prueba el mismo número en bucle.
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

  -- 0 o más de uno: misma respuesta. No devolvemos la clave de otra persona
  -- si el RUT está duplicado, ni confirmamos que el número existe.
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

  -- primera_consulta_rut_en IS NULL: solo se entrega mientras nadie la haya
  -- consultado todavía. Un reseteo de clave desde el admin crea una fila
  -- nueva sin esta marca, así que vuelve a habilitar una consulta más.
  SELECT p.id, cv.usuario_login, cv.password_plano
    INTO v_usuario_id, v_login, v_password
  FROM public.perfiles p
  JOIN public.credencial_visible cv
    ON cv.usuario_id = p.id AND cv.club_id = p.club_id
  WHERE p.jugador_id = v_jugador_id
    AND p.club_id = p_club_id
    AND p.rol = 'jugador'
    AND cv.password_plano IS NOT NULL
    AND length(cv.password_plano) > 0
    AND cv.primera_consulta_rut_en IS NULL
  LIMIT 1;

  IF v_login IS NULL OR v_password IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.credencial_visible
  SET primera_consulta_rut_en = now()
  WHERE usuario_id = v_usuario_id;

  RETURN QUERY SELECT true, false, v_nombre, v_login, v_password;
END;
$$;

REVOKE ALL ON FUNCTION public.consultar_credencial_por_rut(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultar_credencial_por_rut(uuid, text) TO anon, authenticated;

COMMIT;
