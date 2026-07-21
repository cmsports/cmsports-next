ALTER TABLE solicitudes_jugador
  ADD COLUMN IF NOT EXISTS fecha_nacimiento              text,
  ADD COLUMN IF NOT EXISTS direccion                     text,
  ADD COLUMN IF NOT EXISTS comuna                        text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre    text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono  text,
  ADD COLUMN IF NOT EXISTS indicaciones_medicas          text;

CREATE OR REPLACE FUNCTION public.crear_solicitud_jugador(
  p_codigo                        text,
  p_club_id                       uuid,
  p_nombre                        text,
  p_rut                           text,
  p_email                         text,
  p_telefono                      text DEFAULT NULL,
  p_fecha_nacimiento              text DEFAULT NULL,
  p_direccion                     text DEFAULT NULL,
  p_comuna                        text DEFAULT NULL,
  p_contacto_emergencia_nombre    text DEFAULT NULL,
  p_contacto_emergencia_telefono  text DEFAULT NULL,
  p_indicaciones_medicas          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo   text := trim(COALESCE(p_codigo, ''));
  v_nombre   text := trim(COALESCE(p_nombre, ''));
  v_rut      text := trim(COALESCE(p_rut, ''));
  v_email    text := lower(trim(COALESCE(p_email, '')));
  v_telefono text := NULLIF(trim(COALESCE(p_telefono, '')), '');
  v_id uuid;
  v_ok_club      boolean;
  v_ok_codigo    boolean;
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

  INSERT INTO public.solicitudes_jugador (
    club_id, nombre, rut, email, telefono, estado, password,
    fecha_nacimiento, direccion, comuna,
    contacto_emergencia_nombre, contacto_emergencia_telefono, indicaciones_medicas
  ) VALUES (
    p_club_id, v_nombre, v_rut, v_email, v_telefono, 'pendiente', NULL,
    NULLIF(trim(COALESCE(p_fecha_nacimiento, '')), ''),
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_comuna, '')), ''),
    NULLIF(trim(COALESCE(p_contacto_emergencia_nombre, '')), ''),
    NULLIF(trim(COALESCE(p_contacto_emergencia_telefono, '')), ''),
    NULLIF(trim(COALESCE(p_indicaciones_medicas, '')), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;
