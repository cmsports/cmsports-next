-- Solo Spinhouse: agenda integrada y publicación explícita de eventos.
-- EJECUCIÓN MANUAL: SQL Editor. Aplicada el: ____________.
-- No borra ni modifica eventos, horarios ni ligas existentes de ningún club.
BEGIN;
SELECT _migracion_nueva('295_calendario_integrado_spinhouse');
SELECT _migracion_para_club('Spinhouse');

CREATE TABLE public.calendario_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubes(id),
  titulo text NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 160),
  tipo text NOT NULL CHECK (tipo IN ('externo','clinica','campamento','reunion','suspension','feriado','otro')),
  fecha date NOT NULL,
  hora_inicio time,
  hora_fin time,
  lugar text NOT NULL DEFAULT '' CHECK (length(lugar) <= 240),
  descripcion text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 2000),
  publico boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fin IS NULL OR (hora_inicio IS NOT NULL AND hora_fin > hora_inicio)),
  UNIQUE (id, club_id)
);
CREATE INDEX calendario_actividades_club_fecha ON public.calendario_actividades(club_id, fecha);
CREATE TABLE public.calendario_nomina (
  actividad_id uuid NOT NULL,
  club_id uuid NOT NULL REFERENCES public.clubes(id),
  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  PRIMARY KEY (actividad_id, jugador_id),
  FOREIGN KEY (actividad_id, club_id) REFERENCES public.calendario_actividades(id, club_id) ON DELETE CASCADE
);
ALTER TABLE public.calendario_actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario_nomina ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendario_actividades_lectura ON public.calendario_actividades FOR SELECT TO authenticated
USING (club_id = public.get_my_club_id() AND EXISTS (
  SELECT 1 FROM public.clubes c WHERE c.id = club_id AND 'calendario_integrado' = ANY(c.modulos_habilitados)));
CREATE POLICY calendario_nomina_lectura ON public.calendario_nomina FOR SELECT TO authenticated
USING (club_id = public.get_my_club_id() AND (
  public.get_my_rol() IN ('admin','profesor') OR jugador_id IN (
    SELECT p.jugador_id FROM public.perfiles p WHERE p.id = auth.uid())));
-- Escrituras exclusivamente mediante RPC atómico, con validación de club,
-- módulo y rol. La nómina jamás se concede a anon.
GRANT SELECT ON public.calendario_actividades, public.calendario_nomina TO authenticated;
REVOKE ALL ON public.calendario_actividades, public.calendario_nomina FROM anon;

CREATE FUNCTION public.guardar_calendario_actividad(p_id uuid, p_datos jsonb, p_jugadores uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid := public.get_my_club_id(); v_id uuid; v_tipo text := p_datos->>'tipo';
BEGIN
  IF public.get_my_rol() NOT IN ('admin','profesor') OR v_club IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clubes WHERE id = v_club AND 'calendario_integrado' = ANY(modulos_habilitados)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF cardinality(COALESCE(p_jugadores, ARRAY[]::uuid[])) > 2000 THEN RAISE EXCEPTION 'Nómina demasiado grande'; END IF;
  IF v_tipo <> 'externo' AND cardinality(COALESCE(p_jugadores, ARRAY[]::uuid[])) > 0 THEN
    RAISE EXCEPTION 'Solo los eventos externos llevan nómina';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_jugadores, ARRAY[]::uuid[])) j WHERE NOT EXISTS (
    SELECT 1 FROM public.jugadores WHERE id = j AND club_id = v_club)) THEN
    RAISE EXCEPTION 'La nómina contiene jugadores de otro club';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.calendario_actividades(club_id,titulo,tipo,fecha,hora_inicio,hora_fin,lugar,descripcion,publico)
    VALUES (v_club,trim(p_datos->>'titulo'),v_tipo,(p_datos->>'fecha')::date,
      NULLIF(p_datos->>'hora_inicio','')::time,NULLIF(p_datos->>'hora_fin','')::time,
      COALESCE(p_datos->>'lugar',''),COALESCE(p_datos->>'descripcion',''),COALESCE((p_datos->>'publico')::boolean,false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.calendario_actividades SET titulo=trim(p_datos->>'titulo'),tipo=v_tipo,
      fecha=(p_datos->>'fecha')::date,hora_inicio=NULLIF(p_datos->>'hora_inicio','')::time,
      hora_fin=NULLIF(p_datos->>'hora_fin','')::time,lugar=COALESCE(p_datos->>'lugar',''),
      descripcion=COALESCE(p_datos->>'descripcion',''),publico=COALESCE((p_datos->>'publico')::boolean,false)
    WHERE id=p_id AND club_id=v_club RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Evento inexistente o ajeno'; END IF;
  END IF;
  -- Reemplazo solicitado por el editor dentro de la misma transacción; no
  -- ejecuta ningún borrado al aplicar esta migración.
  DELETE FROM public.calendario_nomina WHERE actividad_id=v_id AND club_id=v_club;
  INSERT INTO public.calendario_nomina(actividad_id,club_id,jugador_id)
    SELECT v_id,v_club,j FROM (SELECT DISTINCT unnest(COALESCE(p_jugadores,ARRAY[]::uuid[])) j) ids;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.guardar_calendario_actividad(uuid,jsonb,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_calendario_actividad(uuid,jsonb,uuid[]) TO authenticated;

-- Proyección pública reducida. Excluye descripciones, alumnos, matrículas,
-- nombres de participantes y todos los eventos antiguos (no son opt-in).
CREATE FUNCTION public.calendario_publico(p_club uuid, p_desde date, p_hasta date)
RETURNS TABLE(id text,titulo text,tipo text,fecha date,hora_inicio text,hora_fin text,lugar text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_hasta < p_desde OR p_hasta-p_desde > 62 OR NOT EXISTS (
    SELECT 1 FROM public.clubes c WHERE c.id=p_club AND 'calendario_integrado' = ANY(c.modulos_habilitados)) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT a.id::text,a.titulo,a.tipo,a.fecha,a.hora_inicio::text,a.hora_fin::text,a.lugar
    FROM public.calendario_actividades a
    WHERE a.club_id=p_club AND a.publico AND a.fecha BETWEEN p_desde AND p_hasta
    UNION ALL
    SELECT 'liga-'||f.id::text||'-'||COALESCE(s.division_id::text,''),
      l.nombre||' · Jornada '||f.numero||COALESCE(' · '||d.nombre,''),'liga_tdm',
      f.fecha+COALESCE(s.dia_offset,0),l.hora_inicio,l.hora_fin,''::text
    FROM public.liga_fechas f JOIN public.ligas l ON l.id=f.liga_id
      LEFT JOIN public.liga_fecha_sesiones s ON s.fecha_id=f.id
      LEFT JOIN public.liga_divisiones d ON d.id=s.division_id
    WHERE l.club_id=p_club AND f.fecha+COALESCE(s.dia_offset,0) BETWEEN p_desde AND p_hasta;
END $$;
REVOKE ALL ON FUNCTION public.calendario_publico(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendario_publico(uuid,date,date) TO anon, authenticated;

DO $$
DECLARE v_tabla text;
BEGIN
  UPDATE public.clubes SET modulos_habilitados=array_append(COALESCE(modulos_habilitados,ARRAY[]::text[]),'calendario_integrado')
  WHERE id=current_setting('cmsports.club_declarado',true)::uuid
    AND NOT ('calendario_integrado'=ANY(COALESCE(modulos_habilitados,ARRAY[]::text[])));
  FOREACH v_tabla IN ARRAY ARRAY['calendario_actividades','calendario_nomina','liga_fechas','liga_fecha_sesiones','liga_divisiones','liga_partidos','liga_mesas','ligas','bloques_horario','bloque_jugadores','eventos','torneos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_tabla) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_tabla);
    END IF;
  END LOOP;
END $$;
COMMIT;
