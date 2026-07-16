-- ============================================================
-- CmSports — Seguridad crítica, fase 1
-- ============================================================

-- 1. Un admin no puede cambiar su propio rol, club o jugador asociado.
-- Solo superadmin o una llamada con service role puede modificar esos campos.
CREATE OR REPLACE FUNCTION public.proteger_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_rol := public.get_my_rol();

  IF TG_OP = 'UPDATE' AND (
       NEW.rol        IS DISTINCT FROM OLD.rol
    OR NEW.club_id    IS DISTINCT FROM OLD.club_id
    OR NEW.jugador_id IS DISTINCT FROM OLD.jugador_id
  ) AND v_rol IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede modificar rol, club o jugador del perfil';
  END IF;

  IF NEW.rol = 'superadmin'
     AND (TG_OP = 'INSERT' OR OLD.rol IS DISTINCT FROM 'superadmin')
     AND v_rol IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede otorgar el rol superadmin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_proteger ON public.perfiles;
CREATE TRIGGER perfiles_proteger
  BEFORE INSERT OR UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil();

-- La interfaz de superadmin administra perfiles de otros clubes.
DROP POLICY IF EXISTS "perfiles_superadmin_all" ON public.perfiles;
CREATE POLICY "perfiles_superadmin_all" ON public.perfiles
  FOR ALL
  USING (public.get_my_rol() = 'superadmin')
  WITH CHECK (public.get_my_rol() = 'superadmin');

-- 2. El registro público solo puede entrar por esta función estrecha.
-- La contraseña ya no forma parte del flujo ni se guarda en la base.
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_rut text := trim(COALESCE(p_rut, ''));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_telefono text := NULLIF(trim(COALESCE(p_telefono, '')), '');
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.invitaciones i
    WHERE i.codigo::text = p_codigo
      AND i.club_id = p_club_id
      AND i.activa = true
  ) THEN
    RAISE EXCEPTION 'Invitación inválida o expirada';
  END IF;

  IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'Nombre inválido';
  END IF;
  IF length(v_rut) < 7 OR length(v_rut) > 20 THEN
    RAISE EXCEPTION 'RUT inválido';
  END IF;
  IF length(v_email) < 3 OR length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF v_telefono IS NOT NULL AND length(v_telefono) > 30 THEN
    RAISE EXCEPTION 'Teléfono inválido';
  END IF;

  SELECT s.id INTO v_id
  FROM public.solicitudes_jugador s
  WHERE s.club_id = p_club_id
    AND s.estado = 'pendiente'
    AND (lower(COALESCE(s.email, '')) = v_email OR COALESCE(s.rut, '') = v_rut)
  ORDER BY s.creado_en DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.solicitudes_jugador (
    club_id, nombre, rut, email, telefono, estado, password
  ) VALUES (
    p_club_id, v_nombre, v_rut, v_email, v_telefono, 'pendiente', NULL
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP POLICY IF EXISTS "solicitudes_insert_public" ON public.solicitudes_jugador;
REVOKE INSERT ON public.solicitudes_jugador FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) TO anon, authenticated;

-- Elimina cualquier contraseña reversible que pudiera seguir pendiente.
UPDATE public.solicitudes_jugador SET password = NULL WHERE password IS NOT NULL;

COMMENT ON COLUMN public.solicitudes_jugador.password IS
  'Obsoleta: no almacenar contraseñas. Se conserva temporalmente por compatibilidad de esquema.';
