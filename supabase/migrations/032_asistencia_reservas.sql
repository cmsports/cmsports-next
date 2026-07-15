-- ============================================================
-- CmSports — asistencia, sesiones y reservas consistentes
-- ============================================================

-- Una persona solo puede tener una reserva por clase. Conservamos el
-- registro más reciente si una instalación antigua contiene duplicados.
DELETE FROM public.reservas r
USING public.reservas duplicada
WHERE r.clase_id = duplicada.clase_id
  AND r.jugador_id = duplicada.jugador_id
  AND (
    COALESCE(r.creado_en, '-infinity'::timestamptz), r.id::text
  ) < (
    COALESCE(duplicada.creado_en, '-infinity'::timestamptz), duplicada.id::text
  );

CREATE UNIQUE INDEX IF NOT EXISTS reservas_clase_jugador_uidx
  ON public.reservas (clase_id, jugador_id);

-- El jugador puede cancelar o reactivar únicamente su propia reserva.
DROP POLICY IF EXISTS "reservas_jugador_update" ON public.reservas;
CREATE POLICY "reservas_jugador_update" ON public.reservas
  FOR UPDATE
  USING (
    jugador_id = public.get_my_jugador_id()
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id AND c.club_id = public.get_my_club_id()
    )
  )
  WITH CHECK (
    jugador_id = public.get_my_jugador_id()
    AND estado IN ('confirmado', 'cancelado')
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id AND c.club_id = public.get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "reservas_jugador_insert" ON public.reservas;
CREATE POLICY "reservas_jugador_insert" ON public.reservas
  FOR INSERT WITH CHECK (
    jugador_id = public.get_my_jugador_id()
    AND estado IN ('confirmado', 'cancelado')
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id AND c.club_id = public.get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "asistencia_write" ON public.asistencia;
CREATE POLICY "asistencia_write" ON public.asistencia
  FOR ALL
  USING (
    club_id = public.get_my_club_id()
    AND public.get_my_rol() IN ('admin', 'profesor')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = asistencia.jugador_id AND j.club_id = public.get_my_club_id()
    )
  )
  WITH CHECK (
    club_id = public.get_my_club_id()
    AND public.get_my_rol() IN ('admin', 'profesor')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = asistencia.jugador_id AND j.club_id = public.get_my_club_id()
    )
  );

-- Registrar asistencia y ajustar sesiones sucede en una sola transacción.
-- La función vuelve a validar club, rol y jugador aunque sea llamada fuera
-- de la aplicación.
CREATE OR REPLACE FUNCTION public.registrar_asistencia_segura(
  p_jugador_id uuid,
  p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Santiago')::date),
  p_hora time DEFAULT ((now() AT TIME ZONE 'America/Santiago')::time)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil record;
  v_jugador record;
  v_asistencia_id uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT club_id, rol, jugador_id
    INTO v_perfil
  FROM public.perfiles
  WHERE id = v_uid;

  IF v_perfil.club_id IS NULL
     OR v_perfil.rol NOT IN ('admin', 'profesor', 'jugador') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  IF v_perfil.rol = 'jugador' AND v_perfil.jugador_id IS DISTINCT FROM p_jugador_id THEN
    RAISE EXCEPTION 'Solo puedes registrar tu propia asistencia';
  END IF;

  IF v_perfil.rol = 'jugador' AND p_fecha IS DISTINCT FROM v_hoy THEN
    RAISE EXCEPTION 'El jugador solo puede registrar la asistencia de hoy';
  END IF;

  IF p_fecha > v_hoy THEN
    RAISE EXCEPTION 'No se puede registrar una fecha futura';
  END IF;

  SELECT id, club_id, nombre, estado, sesiones_usadas, sesiones_limite
    INTO v_jugador
  FROM public.jugadores
  WHERE id = p_jugador_id
  FOR UPDATE;

  IF v_jugador.id IS NULL OR v_jugador.club_id IS DISTINCT FROM v_perfil.club_id THEN
    RAISE EXCEPTION 'Jugador no encontrado en tu club';
  END IF;

  IF v_jugador.estado IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'El jugador no está activo';
  END IF;

  -- Serializa check-ins simultáneos del mismo jugador y día.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_jugador_id::text || ':' || p_fecha::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.asistencia
    WHERE jugador_id = p_jugador_id AND fecha = p_fecha
  ) THEN
    RAISE EXCEPTION 'La asistencia ya fue registrada para ese día';
  END IF;

  IF COALESCE(v_jugador.sesiones_limite, 0) > 0
     AND COALESCE(v_jugador.sesiones_usadas, 0) >= v_jugador.sesiones_limite THEN
    RAISE EXCEPTION 'No quedan sesiones disponibles este mes';
  END IF;

  INSERT INTO public.asistencia (
    club_id, jugador_id, fecha, hora, metodo
  ) VALUES (
    v_perfil.club_id, p_jugador_id, p_fecha, p_hora,
    CASE WHEN v_perfil.rol = 'jugador' THEN 'autoregistro' ELSE 'manual' END
  )
  RETURNING id INTO v_asistencia_id;

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) + 1)
  WHERE id = p_jugador_id;

  RETURN v_asistencia_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_asistencia_segura(p_asistencia_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil record;
  v_asistencia record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT club_id, rol INTO v_perfil
  FROM public.perfiles
  WHERE id = v_uid;

  IF v_perfil.club_id IS NULL OR v_perfil.rol NOT IN ('admin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o profesor puede eliminar asistencias';
  END IF;

  SELECT id, jugador_id, club_id INTO v_asistencia
  FROM public.asistencia
  WHERE id = p_asistencia_id
  FOR UPDATE;

  IF v_asistencia.id IS NULL OR v_asistencia.club_id IS DISTINCT FROM v_perfil.club_id THEN
    RAISE EXCEPTION 'Asistencia no encontrada';
  END IF;

  DELETE FROM public.asistencia WHERE id = p_asistencia_id;

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) - 1)
  WHERE id = v_asistencia.jugador_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_asistencia_segura(uuid, date, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_asistencia_segura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_segura(uuid, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_asistencia_segura(uuid) TO authenticated;

-- Kiosco público: el RUT se compara dentro de PostgreSQL y nunca se entrega
-- al navegador. Solo se devuelve nombre/hora después de una coincidencia.
CREATE OR REPLACE FUNCTION public.obtener_club_asistencia(p_club_id uuid)
RETURNS TABLE(nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.nombre::text
  FROM public.clubes c
  WHERE c.id = p_club_id
  LIMIT 1
$$;

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
  IF length(v_rut) < 7 OR length(v_rut) > 9 THEN
    RAISE EXCEPTION 'RUT inválido';
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

  INSERT INTO public.asistencia (
    club_id, jugador_id, fecha, hora, metodo
  ) VALUES (
    p_club_id, v_jugador.id, v_fecha, v_hora, 'rut'
  );

  UPDATE public.jugadores
  SET sesiones_usadas = GREATEST(0, COALESCE(sesiones_usadas, 0) + 1)
  WHERE id = v_jugador.id;

  RETURN QUERY SELECT v_jugador.nombre::text, v_hora, false;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_club_asistencia(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_asistencia_rut(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_club_asistencia(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_rut(uuid, text) TO anon, authenticated;

-- Cambio de reserva atómico: insertar, cancelar y reactivar usan la misma
-- operación y siempre validan jugador, clase y club.
CREATE OR REPLACE FUNCTION public.cambiar_reserva_clase(
  p_clase_id uuid,
  p_confirmar boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil record;
  v_clase record;
  v_jugador record;
  v_estado text := CASE WHEN p_confirmar THEN 'confirmado' ELSE 'cancelado' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT club_id, rol, jugador_id INTO v_perfil
  FROM public.perfiles
  WHERE id = v_uid;

  IF v_perfil.rol IS DISTINCT FROM 'jugador' OR v_perfil.jugador_id IS NULL THEN
    RAISE EXCEPTION 'Solo un jugador puede cambiar su reserva';
  END IF;

  SELECT id, club_id, fecha, publicada INTO v_clase
  FROM public.clases
  WHERE id = p_clase_id;

  IF v_clase.id IS NULL OR v_clase.club_id IS DISTINCT FROM v_perfil.club_id THEN
    RAISE EXCEPTION 'Clase no encontrada';
  END IF;

  IF p_confirmar AND v_clase.publicada IS NOT TRUE THEN
    RAISE EXCEPTION 'La clase no está disponible';
  END IF;

  IF p_confirmar AND v_clase.fecha < (now() AT TIME ZONE 'America/Santiago')::date THEN
    RAISE EXCEPTION 'No se puede reservar una clase pasada';
  END IF;

  SELECT sesiones_usadas, sesiones_limite INTO v_jugador
  FROM public.jugadores
  WHERE id = v_perfil.jugador_id AND club_id = v_perfil.club_id AND estado = 'activo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o inactivo';
  END IF;

  IF p_confirmar
     AND COALESCE(v_jugador.sesiones_limite, 0) > 0
     AND COALESCE(v_jugador.sesiones_usadas, 0) >= v_jugador.sesiones_limite THEN
    RAISE EXCEPTION 'No quedan sesiones disponibles este mes';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_perfil.jugador_id::text || ':' || p_clase_id::text, 0));

  INSERT INTO public.reservas (clase_id, jugador_id, estado)
  VALUES (p_clase_id, v_perfil.jugador_id, v_estado)
  ON CONFLICT (clase_id, jugador_id)
  DO UPDATE SET estado = EXCLUDED.estado;

  RETURN v_estado;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_reserva_clase(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cambiar_reserva_clase(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_reservas_clases(p_clase_ids uuid[])
RETURNS TABLE(clase_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.clase_id, count(*)::bigint
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  WHERE r.clase_id = ANY(COALESCE(p_clase_ids, ARRAY[]::uuid[]))
    AND r.estado = 'confirmado'
    AND c.club_id = public.get_my_club_id()
  GROUP BY r.clase_id
$$;

REVOKE ALL ON FUNCTION public.contar_reservas_clases(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contar_reservas_clases(uuid[]) TO authenticated;

-- Habilita propagación a otras sesiones. El bloque es idempotente tanto si
-- las tablas ya estaban publicadas como si aún no lo estaban.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asistencia;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clases;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
