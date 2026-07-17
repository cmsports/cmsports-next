-- ============================================================
-- CmSports — límites para endpoints públicos y cargas de imágenes
-- Ejecutar manualmente después de 038. Es idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.limites_publicos (
  alcance text NOT NULL,
  clave_hash text NOT NULL,
  ventana_inicio bigint NOT NULL,
  intentos integer NOT NULL DEFAULT 1 CHECK (intentos > 0),
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (alcance, clave_hash, ventana_inicio)
);

ALTER TABLE public.limites_publicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limites_publicos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._consumir_limite_publico(
  p_alcance text,
  p_clave text,
  p_maximo integer,
  p_ventana_segundos integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ventana bigint;
  v_filas integer;
BEGIN
  IF p_alcance IS NULL OR p_clave IS NULL
     OR length(p_alcance) NOT BETWEEN 1 AND 60
     OR length(p_clave) NOT BETWEEN 1 AND 500
     OR p_maximo NOT BETWEEN 1 AND 1000
     OR p_ventana_segundos NOT BETWEEN 10 AND 86400 THEN
    RAISE EXCEPTION 'Configuración de límite inválida';
  END IF;

  v_ventana := floor(extract(epoch FROM clock_timestamp()) / p_ventana_segundos)::bigint;

  INSERT INTO public.limites_publicos (
    alcance, clave_hash, ventana_inicio, intentos, actualizado_en
  ) VALUES (
    p_alcance, md5(p_clave), v_ventana, 1, clock_timestamp()
  )
  ON CONFLICT (alcance, clave_hash, ventana_inicio)
  DO UPDATE SET
    intentos = public.limites_publicos.intentos + 1,
    actualizado_en = clock_timestamp()
  WHERE public.limites_publicos.intentos < p_maximo;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  -- Limpieza oportunista; nunca se guardan RUT, email ni nombres en claro.
  IF random() < 0.01 THEN
    DELETE FROM public.limites_publicos
    WHERE actualizado_en < clock_timestamp() - interval '2 days';
  END IF;

  RETURN v_filas = 1;
END;
$$;

REVOKE ALL ON FUNCTION public._consumir_limite_publico(text, text, integer, integer) FROM PUBLIC;

-- La cuota de IA queda persistida en PostgreSQL; el servidor conserva además
-- un límite corto por instancia para impedir generaciones concurrentes.
CREATE OR REPLACE FUNCTION public.consumir_cuota_flyer_ia()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = v_uid AND p.club_id IS NOT NULL
      AND p.rol IN ('admin', 'profesor', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  IF NOT public._consumir_limite_publico('flyer-corto', v_uid::text, 2, 300)
     OR NOT public._consumir_limite_publico('flyer-diario', v_uid::text, 10, 86400) THEN
    RAISE EXCEPTION 'Límite de generación de flyers alcanzado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_cuota_flyer_ia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_cuota_flyer_ia() TO authenticated;

-- Kiosco público: límite global por club y por RUT normalizado.
CREATE OR REPLACE FUNCTION public.registrar_asistencia_rut(
  p_club_id uuid,
  p_rut text
)
RETURNS TABLE(jugador_nombre text, hora_registro time, ya_registrada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rut text := regexp_replace(lower(COALESCE(p_rut, '')), '[^0-9k]', '', 'g');
  v_jugador record;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_hora time := (now() AT TIME ZONE 'America/Santiago')::time;
  v_existente record;
BEGIN
  IF p_club_id IS NULL OR length(v_rut) < 7 OR length(v_rut) > 9 THEN
    RAISE EXCEPTION 'RUT inválido';
  END IF;

  IF NOT public._consumir_limite_publico('asistencia-club', p_club_id::text, 60, 60)
     OR NOT public._consumir_limite_publico('asistencia-rut', p_club_id::text || ':' || v_rut, 5, 600) THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera unos minutos';
  END IF;

  SELECT j.id, j.nombre, j.estado, j.sesiones_usadas, j.sesiones_limite
    INTO v_jugador
  FROM public.jugadores j
  WHERE j.club_id = p_club_id
    AND regexp_replace(lower(COALESCE(j.rut, '')), '[^0-9k]', '', 'g') = v_rut
  LIMIT 1
  FOR UPDATE;

  IF v_jugador.id IS NULL OR v_jugador.estado IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'RUT no encontrado o jugador inactivo';
  END IF;

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
    RAISE EXCEPTION 'No quedan sesiones disponibles este mes';
  END IF;

  INSERT INTO public.asistencia (club_id, jugador_id, fecha, hora, metodo)
  VALUES (p_club_id, v_jugador.id, v_fecha, v_hora, 'rut');

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) + 1)
  WHERE id = v_jugador.id;

  RETURN QUERY SELECT v_jugador.nombre::text, v_hora, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_asistencia_rut(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_rut(uuid, text) TO anon, authenticated;

-- Registro público: conserva UX idempotente y limita solicitudes nuevas.
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
  v_codigo text := trim(COALESCE(p_codigo, ''));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_rut text := trim(COALESCE(p_rut, ''));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_telefono text := NULLIF(trim(COALESCE(p_telefono, '')), '');
  v_id uuid;
BEGIN
  IF p_club_id IS NULL THEN RAISE EXCEPTION 'Club inválido'; END IF;

  -- La cuota se consume antes de consultar la invitación. Así, probar códigos
  -- inexistentes no permite saltarse el límite ni amplificar consultas.
  IF NOT public._consumir_limite_publico('solicitud-intento-club', p_club_id::text, 40, 600)
     OR NOT public._consumir_limite_publico(
       'solicitud-intento-codigo', p_club_id::text || ':' || v_codigo, 8, 600
     ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitaciones i
    WHERE i.codigo::text = v_codigo AND i.club_id = p_club_id AND i.activa = true
  ) THEN
    -- No lanzar excepción: una excepción revertiría también la cuota consumida.
    RETURN NULL;
  END IF;
  IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
  IF length(v_rut) < 7 OR length(v_rut) > 20 THEN RAISE EXCEPTION 'RUT inválido'; END IF;
  IF length(v_email) < 3 OR length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF v_telefono IS NOT NULL AND length(v_telefono) > 30 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;

  IF NOT public._consumir_limite_publico('solicitud-club', p_club_id::text, 30, 600)
     OR NOT public._consumir_limite_publico(
       'solicitud-identidad', p_club_id::text || ':' || v_email || ':' || v_rut, 3, 3600
     ) THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta más tarde';
  END IF;

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

-- Aviso público de torneo: valida, evita duplicados recientes y limita spam.
CREATE OR REPLACE FUNCTION public.solicitar_inscripcion_torneo(p_codigo text, p_nombre text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo text := upper(trim(COALESCE(p_codigo, '')));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_club uuid;
  v_id uuid;
BEGIN
  IF length(v_codigo) < 3 OR length(v_codigo) > 64 THEN RAISE EXCEPTION 'Código inválido'; END IF;
  IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;

  -- También se consume antes de resolver el torneo: los códigos inválidos
  -- quedan sujetos a cuota aunque nunca produzcan una fila.
  IF NOT public._consumir_limite_publico('torneo-intento-global', 'global', 300, 60)
     OR NOT public._consumir_limite_publico('torneo-intento-codigo', v_codigo, 8, 600) THEN
    RETURN json_build_object('ok', false);
  END IF;

  SELECT club_id INTO v_club FROM public.torneos WHERE codigo = v_codigo LIMIT 1;
  -- Un retorno normal conserva la cuota; RAISE la revertiría con la transacción.
  IF v_club IS NULL THEN RETURN json_build_object('ok', false); END IF;

  IF NOT public._consumir_limite_publico('torneo-club', v_club::text, 40, 600)
     OR NOT public._consumir_limite_publico(
       'torneo-nombre', v_club::text || ':' || lower(v_nombre), 3, 3600
     ) THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta más tarde';
  END IF;

  SELECT s.id INTO v_id
  FROM public.solicitudes_jugador s
  WHERE s.club_id = v_club AND s.estado = 'pendiente'
    AND lower(trim(s.nombre)) = lower(v_nombre)
    AND s.creado_en >= clock_timestamp() - interval '30 minutes'
  ORDER BY s.creado_en DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'solicitud_id', v_id, 'duplicada', true);
  END IF;

  INSERT INTO public.solicitudes_jugador (club_id, nombre, estado)
  VALUES (v_club, v_nombre, 'pendiente') RETURNING id INTO v_id;
  RETURN json_build_object('ok', true, 'solicitud_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_inscripcion_torneo(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text) TO anon, authenticated;

-- El servidor valida además firma y tamaño; Storage replica el mismo límite.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('flyer-referencias', 'galeria-fotos');

COMMIT;
