-- ============================================================
-- CmSports — kioscos autorizados y solicitudes públicas seguras
-- Orden obligatorio: 040 -> 041 -> 042 -> despliegue del código asociado.
-- Aditiva e idempotente. No contiene tokens en texto plano.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- 1. Dispositivos de asistencia
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kioscos_asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(nombre) BETWEEN 2 AND 80),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  rotado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  ultimo_uso_en timestamptz
);

CREATE INDEX IF NOT EXISTS kioscos_asistencia_club_idx
  ON public.kioscos_asistencia (club_id, activo);

ALTER TABLE public.kioscos_asistencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kioscos_asistencia FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.kioscos_asistencia.token_hash IS
  'SHA-256 del token. El secreto en texto plano se entrega una sola vez al administrador.';

CREATE OR REPLACE FUNCTION public.crear_o_rotar_kiosco_asistencia(
  p_nombre text,
  p_kiosco_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_token text;
  v_token_hash text;
  v_id uuid;
BEGIN
  SELECT p.club_id INTO v_club_id
  FROM public.perfiles p
  WHERE p.id = v_uid AND p.rol = 'admin' AND p.club_id IS NOT NULL;

  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;

  v_token := 'cmsk_' || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  IF p_kiosco_id IS NULL THEN
    INSERT INTO public.kioscos_asistencia (
      club_id, nombre, token_hash, activo, creado_por
    ) VALUES (
      v_club_id, v_nombre, v_token_hash, true, v_uid
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.kioscos_asistencia
    SET nombre = v_nombre,
        token_hash = v_token_hash,
        activo = true,
        rotado_en = clock_timestamp(),
        ultimo_uso_en = NULL
    WHERE id = p_kiosco_id AND club_id = v_club_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN RAISE EXCEPTION 'Dispositivo no encontrado'; END IF;
  END IF;

  -- Única salida del secreto. La tabla conserva exclusivamente su hash.
  RETURN jsonb_build_object(
    'id', v_id,
    'club_id', v_club_id,
    'nombre', v_nombre,
    'token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_kioscos_asistencia()
RETURNS TABLE(
  id uuid,
  club_id uuid,
  nombre text,
  activo boolean,
  creado_en timestamptz,
  rotado_en timestamptz,
  ultimo_uso_en timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_club_id uuid;
BEGIN
  SELECT p.club_id INTO v_club_id
  FROM public.perfiles p
  WHERE p.id = v_uid AND p.rol = 'admin' AND p.club_id IS NOT NULL;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  RETURN QUERY
  SELECT k.id, k.club_id, k.nombre, k.activo,
         k.creado_en, k.rotado_en, k.ultimo_uso_en
  FROM public.kioscos_asistencia k
  WHERE k.club_id = v_club_id
  ORDER BY k.creado_en DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revocar_kiosco_asistencia(p_kiosco_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_filas integer;
BEGIN
  SELECT p.club_id INTO v_club_id
  FROM public.perfiles p
  WHERE p.id = v_uid AND p.rol = 'admin' AND p.club_id IS NOT NULL;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  UPDATE public.kioscos_asistencia
  SET activo = false, rotado_en = clock_timestamp(), ultimo_uso_en = NULL
  WHERE id = p_kiosco_id AND club_id = v_club_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_o_rotar_kiosco_asistencia(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_kioscos_asistencia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revocar_kiosco_asistencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_o_rotar_kiosco_asistencia(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_kioscos_asistencia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revocar_kiosco_asistencia(uuid) TO authenticated;

-- Enlazar el navegador comprueba el secreto antes de habilitar el formulario.
CREATE OR REPLACE FUNCTION public.autorizar_kiosco_asistencia(
  p_club_id uuid,
  p_token text
)
RETURNS TABLE(club_nombre text, kiosco_nombre text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text := trim(COALESCE(p_token, ''));
  v_hash text;
  v_kiosco_id uuid;
  v_kiosco_nombre text;
  v_club_nombre text;
  v_ok_club boolean;
  v_ok_token boolean;
BEGIN
  IF p_club_id IS NULL OR v_token !~ '^cmsk_[0-9a-f]{64}$' THEN RETURN; END IF;
  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  v_ok_club := public._consumir_limite_publico('kiosco-enlace-club', p_club_id::text, 120, 60);
  v_ok_token := public._consumir_limite_publico('kiosco-enlace-token', v_hash, 30, 600);
  IF NOT v_ok_club OR NOT v_ok_token THEN RETURN; END IF;

  SELECT k.id, k.nombre, c.nombre
    INTO v_kiosco_id, v_kiosco_nombre, v_club_nombre
  FROM public.kioscos_asistencia k
  JOIN public.clubes c ON c.id = k.club_id
  WHERE k.club_id = p_club_id AND k.token_hash = v_hash AND k.activo = true
  LIMIT 1;

  IF v_kiosco_id IS NULL THEN RETURN; END IF;
  UPDATE public.kioscos_asistencia SET ultimo_uso_en = clock_timestamp() WHERE id = v_kiosco_id;
  RETURN QUERY SELECT v_club_nombre, v_kiosco_nombre;
END;
$$;

-- La versión anterior queda sin ejecución: conocer club + RUT ya no basta.
REVOKE ALL ON FUNCTION public.registrar_asistencia_rut(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_rut(
  p_club_id uuid,
  p_rut text,
  p_token text
)
RETURNS TABLE(jugador_nombre text, hora_registro time, ya_registrada boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_rut text := regexp_replace(lower(COALESCE(p_rut, '')), '[^0-9k]', '', 'g');
  v_token text := trim(COALESCE(p_token, ''));
  v_token_hash text;
  v_kiosco_id uuid;
  v_jugador record;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_hora time := (now() AT TIME ZONE 'America/Santiago')::time;
  v_existente record;
  v_ok_club boolean;
  v_ok_token boolean;
  v_ok_rut boolean;
BEGIN
  IF p_club_id IS NULL OR length(v_rut) NOT BETWEEN 7 AND 9
     OR v_token !~ '^cmsk_[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  v_token_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
  -- Los tres contadores se ejecutan antes de cualquier consulta de identidad.
  v_ok_club := public._consumir_limite_publico('asistencia-club', p_club_id::text, 180, 60);
  v_ok_token := public._consumir_limite_publico('asistencia-token', v_token_hash, 120, 60);
  v_ok_rut := public._consumir_limite_publico('asistencia-rut', p_club_id::text || ':' || v_rut, 5, 600);
  IF NOT v_ok_club OR NOT v_ok_token OR NOT v_ok_rut THEN RETURN; END IF;

  SELECT k.id INTO v_kiosco_id
  FROM public.kioscos_asistencia k
  WHERE k.club_id = p_club_id AND k.token_hash = v_token_hash AND k.activo = true
  LIMIT 1;
  IF v_kiosco_id IS NULL THEN RETURN; END IF;

  UPDATE public.kioscos_asistencia SET ultimo_uso_en = clock_timestamp() WHERE id = v_kiosco_id;

  SELECT j.id, j.nombre, j.estado, j.sesiones_usadas, j.sesiones_limite
    INTO v_jugador
  FROM public.jugadores j
  WHERE j.club_id = p_club_id
    AND regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = v_rut
  LIMIT 1
  FOR UPDATE;

  -- Mismo resultado vacío para RUT inexistente, inactivo o sin sesiones.
  IF v_jugador.id IS NULL OR v_jugador.estado IS DISTINCT FROM 'activo' THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_jugador.id::text || ':' || v_fecha::text, 0));

  SELECT a.hora INTO v_existente
  FROM public.asistencia a
  WHERE a.jugador_id = v_jugador.id AND a.fecha = v_fecha
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_jugador.nombre::text, v_existente.hora::time, true;
    RETURN;
  END IF;

  IF COALESCE(v_jugador.sesiones_limite, 0) > 0
     AND COALESCE(v_jugador.sesiones_usadas, 0) >= v_jugador.sesiones_limite THEN
    RETURN;
  END IF;

  INSERT INTO public.asistencia (club_id, jugador_id, fecha, hora, metodo)
  VALUES (p_club_id, v_jugador.id, v_fecha, v_hora, 'rut');

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) + 1)
  WHERE id = v_jugador.id;

  RETURN QUERY SELECT v_jugador.nombre::text, v_hora, false;
END;
$$;

REVOKE ALL ON FUNCTION public.autorizar_kiosco_asistencia(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_asistencia_rut(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autorizar_kiosco_asistencia(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_rut(uuid, text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 2. Invitaciones: cuota previa a la consulta y respuesta neutra
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_invitacion(p_codigo text, p_club_id uuid DEFAULT NULL)
RETURNS TABLE(club_id uuid, club_nombre text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo text := trim(COALESCE(p_codigo, ''));
  v_ok_global boolean;
  v_ok_club boolean;
  v_ok_codigo boolean;
BEGIN
  IF length(v_codigo) NOT BETWEEN 3 AND 64 THEN RETURN; END IF;

  v_ok_global := public._consumir_limite_publico('invitacion-global', 'global', 300, 60);
  v_ok_club := public._consumir_limite_publico(
    'invitacion-club', COALESCE(p_club_id::text, 'sin-club'), 40, 600
  );
  v_ok_codigo := public._consumir_limite_publico('invitacion-codigo', v_codigo, 8, 600);
  IF NOT v_ok_global OR NOT v_ok_club OR NOT v_ok_codigo THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.nombre::text
  FROM public.invitaciones i
  JOIN public.clubes c ON c.id = i.club_id
  WHERE i.codigo::text = v_codigo
    AND i.activa = true
    AND (p_club_id IS NULL OR i.club_id = p_club_id)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_invitacion(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_invitacion(text, uuid) TO anon, authenticated;

-- Repite la versión final para instalaciones donde 040 ya fue aplicada.
CREATE OR REPLACE FUNCTION public.crear_solicitud_jugador(
  p_codigo text,
  p_club_id uuid,
  p_nombre text,
  p_rut text,
  p_email text,
  p_telefono text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo text := trim(COALESCE(p_codigo, ''));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_rut text := trim(COALESCE(p_rut, ''));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_telefono text := NULLIF(trim(COALESCE(p_telefono, '')), '');
  v_id uuid;
  v_ok_club boolean;
  v_ok_codigo boolean;
  v_ok_identidad boolean;
BEGIN
  IF p_club_id IS NULL OR length(v_codigo) NOT BETWEEN 3 AND 64 THEN RETURN NULL; END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
  IF length(v_rut) NOT BETWEEN 7 AND 20 THEN RAISE EXCEPTION 'RUT inválido'; END IF;
  IF length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF v_telefono IS NOT NULL AND length(v_telefono) > 30 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;

  v_ok_club := public._consumir_limite_publico('solicitud-intento-club', p_club_id::text, 40, 600);
  v_ok_codigo := public._consumir_limite_publico(
    'solicitud-intento-codigo', p_club_id::text || ':' || v_codigo, 8, 600
  );
  IF NOT v_ok_club OR NOT v_ok_codigo THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitaciones i
    WHERE i.codigo::text = v_codigo AND i.club_id = p_club_id AND i.activa = true
  ) THEN
    RETURN NULL;
  END IF;

  v_ok_identidad := public._consumir_limite_publico(
    'solicitud-identidad', p_club_id::text || ':' || v_email || ':' || v_rut, 3, 3600
  );
  IF NOT v_ok_identidad THEN RETURN NULL; END IF;

  SELECT s.id INTO v_id
  FROM public.solicitudes_jugador s
  WHERE s.club_id = p_club_id AND s.estado = 'pendiente'
    AND (lower(COALESCE(s.email, '')) = v_email OR COALESCE(s.rut, '') = v_rut)
  ORDER BY s.creado_en DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.solicitudes_jugador (club_id, nombre, rut, email, telefono, estado, password)
  VALUES (p_club_id, v_nombre, v_rut, v_email, v_telefono, 'pendiente', NULL)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. Solicitudes de torneo: torneo + identidad, no nombre
-- ------------------------------------------------------------
ALTER TABLE public.solicitudes_jugador
  ADD COLUMN IF NOT EXISTS torneo_id uuid,
  ADD COLUMN IF NOT EXISTS identidad_hash text,
  ADD COLUMN IF NOT EXISTS origen text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.solicitudes_jugador'::regclass
      AND conname = 'solicitudes_jugador_torneo_id_fkey'
  ) THEN
    ALTER TABLE public.solicitudes_jugador
      ADD CONSTRAINT solicitudes_jugador_torneo_id_fkey
      FOREIGN KEY (torneo_id) REFERENCES public.torneos(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_torneo_identidad_pendiente_uidx
  ON public.solicitudes_jugador (torneo_id, identidad_hash)
  WHERE torneo_id IS NOT NULL AND identidad_hash IS NOT NULL AND estado = 'pendiente';

COMMENT ON COLUMN public.solicitudes_jugador.identidad_hash IS
  'SHA-256 del correo normalizado para deduplicar sin usar el nombre.';

-- La versión de dos parámetros deduplicaba por nombre y ya no es pública.
REVOKE ALL ON FUNCTION public.solicitar_inscripcion_torneo(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_inscripcion_torneo(
  p_codigo text,
  p_nombre text,
  p_email text
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_codigo text := upper(trim(COALESCE(p_codigo, '')));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_identidad_hash text;
  v_torneo_id uuid;
  v_club_id uuid;
  v_id uuid;
  v_insertada boolean;
  v_ok_global boolean;
  v_ok_codigo boolean;
  v_ok_identidad boolean;
  v_ok_club boolean;
BEGIN
  IF length(v_codigo) NOT BETWEEN 3 AND 64 OR length(v_nombre) NOT BETWEEN 2 AND 120 THEN
    RETURN json_build_object('ok', false);
  END IF;
  IF length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN json_build_object('ok', false);
  END IF;

  v_identidad_hash := encode(digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex');
  -- Todas estas cuotas se consumen antes de consultar el código.
  v_ok_global := public._consumir_limite_publico('torneo-intento-global', 'global', 300, 60);
  v_ok_codigo := public._consumir_limite_publico('torneo-intento-codigo', v_codigo, 8, 600);
  v_ok_identidad := public._consumir_limite_publico(
    'torneo-intento-identidad', v_codigo || ':' || v_identidad_hash, 3, 3600
  );
  IF NOT v_ok_global OR NOT v_ok_codigo OR NOT v_ok_identidad THEN
    RETURN json_build_object('ok', false);
  END IF;

  SELECT t.id, t.club_id INTO v_torneo_id, v_club_id
  FROM public.torneos t WHERE t.codigo = v_codigo LIMIT 1;
  IF v_torneo_id IS NULL OR v_club_id IS NULL THEN
    -- Retorno normal: conserva los contadores de los códigos inválidos.
    RETURN json_build_object('ok', false);
  END IF;

  v_ok_club := public._consumir_limite_publico('torneo-club', v_club_id::text, 40, 600);
  IF NOT v_ok_club THEN RETURN json_build_object('ok', false); END IF;

  INSERT INTO public.solicitudes_jugador (
    club_id, torneo_id, nombre, email, identidad_hash, origen, estado
  ) VALUES (
    v_club_id, v_torneo_id, v_nombre, v_email, v_identidad_hash, 'torneo_publico', 'pendiente'
  )
  ON CONFLICT (torneo_id, identidad_hash)
    WHERE torneo_id IS NOT NULL AND identidad_hash IS NOT NULL AND estado = 'pendiente'
  DO NOTHING
  RETURNING id INTO v_id;

  v_insertada := v_id IS NOT NULL;
  IF v_id IS NULL THEN
    SELECT s.id INTO v_id
    FROM public.solicitudes_jugador s
    WHERE s.torneo_id = v_torneo_id
      AND s.identidad_hash = v_identidad_hash
      AND s.estado = 'pendiente'
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'ok', v_id IS NOT NULL,
    'solicitud_id', v_id,
    'duplicada', NOT v_insertada
  );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_inscripcion_torneo(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text, text) TO anon, authenticated;

COMMIT;
