-- SOLO Spinhouse. Tablas nuevas vacías; ningún dato de jugadores de otros clubes cambia.
-- Aplicar manualmente en SQL Editor antes de habilitar la interfaz.
BEGIN;
SELECT _migracion_nueva('296_ficha_paralimpica_spinhouse');
SELECT _migracion_para_club('Spinhouse');

-- La habilitación es dato y también limita la base, incluso si otro club
-- activara accidentalmente el módulo en la interfaz.
CREATE TABLE public.club_ficha_paralimpica (
  club_id uuid PRIMARY KEY REFERENCES public.clubes(id)
);
ALTER TABLE public.club_ficha_paralimpica ENABLE ROW LEVEL SECURITY;
INSERT INTO public.club_ficha_paralimpica(club_id)
VALUES (public._migracion_para_club('Spinhouse'));
CREATE POLICY ficha_paralimpica_club_lee ON public.club_ficha_paralimpica
FOR SELECT TO authenticated USING (club_id = public.get_my_club_id());
GRANT SELECT ON public.club_ficha_paralimpica TO authenticated;

CREATE TABLE public.jugador_consentimientos_salud (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.club_ficha_paralimpica(club_id),
  otorgado boolean NOT NULL,
  fecha date NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  firmado_por text NOT NULL CHECK (firmado_por IN ('jugador', 'apoderado')),
  nombre_firmante text NOT NULL CHECK (length(btrim(nombre_firmante)) BETWEEN 3 AND 160),
  respaldo text NOT NULL CHECK (length(btrim(respaldo)) BETWEEN 3 AND 1000),
  registrado_por_nombre text
);
CREATE INDEX consentimientos_salud_jugador_fecha ON public.jugador_consentimientos_salud
(jugador_id, fecha DESC, creado_en DESC);
ALTER TABLE public.jugador_consentimientos_salud ENABLE ROW LEVEL SECURITY;
CREATE POLICY salud_staff_lee ON public.jugador_consentimientos_salud
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
);
CREATE POLICY salud_jugador_lee ON public.jugador_consentimientos_salud
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id() AND jugador_id = public.get_my_jugador_id()
);
-- Historial inmutable: las escrituras solo se hacen por RPC; sin UPDATE/DELETE.
GRANT SELECT ON public.jugador_consentimientos_salud TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.jugador_consentimientos_salud FROM anon, authenticated;

CREATE TABLE public.jugador_ficha_paralimpica (
  jugador_id uuid PRIMARY KEY REFERENCES public.jugadores(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.club_ficha_paralimpica(club_id),
  modalidad text CHECK (modalidad IN ('sentado', 'de_pie', 'intelectual')),
  clase_deportiva integer,
  necesidades_accesibilidad text CHECK (length(necesidades_accesibilidad) <= 2000),
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  actualizado_por_nombre text,
  CONSTRAINT clase_modalidad_valida CHECK (
    clase_deportiva IS NULL OR
    (modalidad IS NOT NULL AND (
      (modalidad = 'sentado' AND clase_deportiva BETWEEN 1 AND 5) OR
      (modalidad = 'de_pie' AND clase_deportiva BETWEEN 6 AND 10) OR
      (modalidad = 'intelectual' AND clase_deportiva = 11)
    ))
  )
);
ALTER TABLE public.jugador_ficha_paralimpica ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.consentimiento_salud_vigente(p_jugador_id uuid, p_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.otorgado FROM public.jugador_consentimientos_salud s
    WHERE s.jugador_id = p_jugador_id AND s.club_id = p_club_id
      AND s.fecha <= (now() AT TIME ZONE 'America/Santiago')::date
      AND p_club_id = public.get_my_club_id()
      AND (public.get_my_rol() IN ('admin', 'superadmin', 'profesor') OR p_jugador_id = public.get_my_jugador_id())
    ORDER BY s.fecha DESC, s.creado_en DESC LIMIT 1
  ), false);
$$;
REVOKE ALL ON FUNCTION public.consentimiento_salud_vigente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consentimiento_salud_vigente(uuid, uuid) TO authenticated;

CREATE POLICY paralimpica_staff_lee_con_permiso ON public.jugador_ficha_paralimpica
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
  AND public.consentimiento_salud_vigente(jugador_id, club_id)
);
-- Derecho de acceso del titular: puede consultar su información incluso si retiró el consentimiento.
CREATE POLICY paralimpica_jugador_lee_lo_suyo ON public.jugador_ficha_paralimpica
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id() AND jugador_id = public.get_my_jugador_id()
);
GRANT SELECT ON public.jugador_ficha_paralimpica TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.jugador_ficha_paralimpica FROM anon, authenticated;

CREATE FUNCTION public.registrar_consentimiento_salud(
  p_jugador_id uuid, p_otorgado boolean, p_fecha date,
  p_firmado_por text, p_nombre_firmante text, p_respaldo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid := public.get_my_club_id();
  v_nacimiento date;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.get_my_rol(), '') NOT IN ('admin', 'superadmin', 'profesor')
    OR NOT EXISTS (SELECT 1 FROM public.club_ficha_paralimpica WHERE club_id = v_club)
  THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  SELECT fecha_nacimiento INTO v_nacimiento FROM public.jugadores
  WHERE id = p_jugador_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Santiago')::date
    OR (v_nacimiento IS NOT NULL AND p_fecha < v_nacimiento)
  THEN RAISE EXCEPTION 'La fecha de firma no es válida'; END IF;
  IF (v_nacimiento IS NULL OR p_fecha < (v_nacimiento + interval '18 years')::date)
    AND p_firmado_por IS DISTINCT FROM 'apoderado'
  THEN RAISE EXCEPTION 'Debe firmar el apoderado si es menor o falta acreditar la edad'; END IF;
  INSERT INTO public.jugador_consentimientos_salud (
    jugador_id, club_id, otorgado, fecha, firmado_por, nombre_firmante, respaldo, registrado_por_nombre
  ) VALUES (
    p_jugador_id, v_club, p_otorgado, p_fecha, p_firmado_por,
    btrim(p_nombre_firmante), btrim(p_respaldo),
    (SELECT nombre FROM public.perfiles WHERE id = auth.uid())
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_consentimiento_salud(uuid, boolean, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_consentimiento_salud(uuid, boolean, date, text, text, text) TO authenticated;

CREATE FUNCTION public.guardar_ficha_paralimpica(
  p_jugador_id uuid, p_modalidad text, p_clase_deportiva integer, p_necesidades_accesibilidad text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid := public.get_my_club_id();
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.get_my_rol(), '') NOT IN ('admin', 'superadmin', 'profesor')
    OR NOT EXISTS (SELECT 1 FROM public.club_ficha_paralimpica WHERE club_id = v_club)
  THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  PERFORM 1 FROM public.jugadores WHERE id = p_jugador_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;
  IF NOT public.consentimiento_salud_vigente(p_jugador_id, v_club)
  THEN RAISE EXCEPTION 'Falta consentimiento vigente para datos de salud'; END IF;
  INSERT INTO public.jugador_ficha_paralimpica (
    jugador_id, club_id, modalidad, clase_deportiva, necesidades_accesibilidad, actualizado_en, actualizado_por_nombre
  ) VALUES (
    p_jugador_id, v_club, p_modalidad, p_clase_deportiva,
    NULLIF(btrim(p_necesidades_accesibilidad), ''), clock_timestamp(),
    (SELECT nombre FROM public.perfiles WHERE id = auth.uid())
  ) ON CONFLICT (jugador_id) DO UPDATE SET
    modalidad = EXCLUDED.modalidad, clase_deportiva = EXCLUDED.clase_deportiva,
    necesidades_accesibilidad = EXCLUDED.necesidades_accesibilidad,
    actualizado_en = EXCLUDED.actualizado_en, actualizado_por_nombre = EXCLUDED.actualizado_por_nombre
  WHERE jugador_ficha_paralimpica.club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo guardar la ficha'; END IF;
  RETURN p_jugador_id;
END;
$$;
REVOKE ALL ON FUNCTION public.guardar_ficha_paralimpica(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_ficha_paralimpica(uuid, text, integer, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_ficha_paralimpica;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_consentimientos_salud;
UPDATE public.clubes
SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'ficha_paralimpica')
WHERE id = public._migracion_para_club('Spinhouse')
  AND NOT ('ficha_paralimpica' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
COMMIT;
