-- Solo Spinhouse. No se cargan tarifas ni se reconstruyen horas históricas.
BEGIN;
SELECT _migracion_nueva('293_finanzas_spinhouse');
SELECT _migracion_para_club('Spinhouse');

UPDATE public.clubes SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'finanzas_spinhouse')
WHERE id = _migracion_para_club('Spinhouse') AND NOT ('finanzas_spinhouse' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

CREATE FUNCTION public.spinhouse_finanzas_contexto() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid;
BEGIN
  v_club := get_my_club_id();
  IF auth.uid() IS NULL OR COALESCE(get_my_rol(),'') NOT IN ('admin','superadmin') OR v_club IS NULL THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club AND 'finanzas_spinhouse' = ANY(modulos_habilitados)) THEN RAISE EXCEPTION 'Finanzas especializadas no habilitadas para este club'; END IF;
  RETURN v_club;
END $$;
REVOKE ALL ON FUNCTION public.spinhouse_finanzas_contexto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spinhouse_finanzas_contexto() TO authenticated;

CREATE TABLE public.spinhouse_finanzas_tarifas (
  club_id uuid NOT NULL REFERENCES clubes(id), profesor_id uuid NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  tipo_clase text NOT NULL CHECK (tipo_clase IN ('grupal','competitivo','particular','adultos','paralimpico','arriendo')),
  rol text NOT NULL CHECK (rol IN ('principal','auxiliar')), desde date NOT NULL CHECK (extract(day FROM desde) = 1),
  monto_hora integer NOT NULL CHECK (monto_hora BETWEEN 0 AND 10000000),
  PRIMARY KEY (club_id, profesor_id, tipo_clase, rol, desde)
);
CREATE TABLE public.spinhouse_finanzas_horas (
  asistencia_id uuid PRIMARY KEY REFERENCES asistencia_profesores(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubes(id), minutos integer NOT NULL CHECK (minutos BETWEEN 1 AND 1440),
  tipo_clase text NOT NULL CHECK (tipo_clase IN ('grupal','competitivo','particular','adultos','paralimpico','arriendo')),
  rol text NOT NULL CHECK (rol IN ('principal','auxiliar')), se_cobra_aparte boolean, confirmado_por uuid, confirmado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.spinhouse_finanzas_asignaciones (
  movimiento_id uuid PRIMARY KEY REFERENCES movimientos(id) ON DELETE CASCADE, club_id uuid NOT NULL REFERENCES clubes(id),
  bloque_id uuid NOT NULL REFERENCES bloques_horario(id), linea text NOT NULL,
  asignado_por uuid, asignado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.spinhouse_finanzas_liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES clubes(id),
  profesor_id uuid NOT NULL, profesor_nombre text NOT NULL, mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12), anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  total integer NOT NULL CHECK (total >= 0), minutos integer NOT NULL CHECK (minutos > 0), detalles jsonb NOT NULL,
  movimiento_id uuid REFERENCES movimientos(id) ON DELETE RESTRICT, creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profesor_id, mes, anio)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['spinhouse_finanzas_tarifas','spinhouse_finanzas_horas','spinhouse_finanzas_asignaciones','spinhouse_finanzas_liquidaciones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY lectura_admin ON public.%I FOR SELECT TO authenticated USING (club_id = get_my_club_id() AND get_my_rol() IN (''admin'',''superadmin'') AND EXISTS (SELECT 1 FROM clubes WHERE id = get_my_club_id() AND ''finanzas_spinhouse'' = ANY(modulos_habilitados)))', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Serializa únicamente las finanzas de UN profesor de UN club.
-- Tarifas, marcas, confirmaciones y cierres usan la misma llave; no bloquea tablas
-- compartidas ni operaciones de otros profesores o clubes.
CREATE FUNCTION public._spinhouse_finanzas_bloquear(p_club uuid,p_profesor uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('spinhouse_finanzas:' || p_club::text || ':' || p_profesor::text,0));
$$;
REVOKE ALL ON FUNCTION public._spinhouse_finanzas_bloquear(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Snapshot al insertar una marca NUEVA. Otras asistencias y clubes siguen igual.
CREATE FUNCTION public.spinhouse_finanzas_congelar_horas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_b bloques_horario%ROWTYPE; v_rol text; v_min integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = NEW.club_id AND 'finanzas_spinhouse' = ANY(modulos_habilitados)) THEN RETURN NEW; END IF;
  PERFORM _spinhouse_finanzas_bloquear(NEW.club_id,NEW.profesor_id);
  IF EXISTS (SELECT 1 FROM spinhouse_finanzas_liquidaciones WHERE club_id = NEW.club_id AND profesor_id = NEW.profesor_id AND mes = extract(month FROM NEW.fecha) AND anio = extract(year FROM NEW.fecha)) THEN RAISE EXCEPTION 'El periodo de esta asistencia ya está liquidado'; END IF;
  -- Una marca retroactiva requiere confirmación explícita, porque el horario puede haber cambiado.
  IF NEW.fecha <> (now() AT TIME ZONE 'America/Santiago')::date THEN RETURN NEW; END IF;
  SELECT * INTO v_b FROM bloques_horario WHERE id = NEW.bloque_id AND club_id = NEW.club_id;
  SELECT bp.rol INTO v_rol FROM bloque_profesores bp JOIN profesores p ON p.id = bp.profesor_id AND p.club_id = NEW.club_id WHERE bp.bloque_id = NEW.bloque_id AND bp.profesor_id = NEW.profesor_id;
  v_min := extract(epoch FROM (v_b.hora_fin::time - v_b.hora_inicio::time))::integer / 60;
  IF v_min > 0 AND v_rol IS NOT NULL THEN
    INSERT INTO spinhouse_finanzas_horas(asistencia_id,club_id,minutos,tipo_clase,rol,se_cobra_aparte,confirmado_por)
    VALUES (NEW.id,NEW.club_id,v_min,COALESCE(v_b.tipo_clase,'grupal'),v_rol,v_b.se_cobra_aparte,auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER spinhouse_finanzas_horas_insert AFTER INSERT ON asistencia_profesores FOR EACH ROW EXECUTE FUNCTION spinhouse_finanzas_congelar_horas();

CREATE FUNCTION public.spinhouse_finanzas_proteger_historico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF TG_TABLE_NAME = 'movimientos' THEN
    IF EXISTS (SELECT 1 FROM spinhouse_finanzas_liquidaciones WHERE movimiento_id = OLD.id) THEN RAISE EXCEPTION 'Este gasto pertenece a una liquidación cerrada y no puede cambiar'; END IF;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      -- Si cambia de profesor, toma ambas llaves en orden estable.
      FOR r IN SELECT DISTINCT q.club_id,q.profesor_id
        FROM (VALUES (OLD.club_id,OLD.profesor_id),(NEW.club_id,NEW.profesor_id)) q(club_id,profesor_id)
        WHERE EXISTS (SELECT 1 FROM clubes c WHERE c.id = q.club_id AND 'finanzas_spinhouse' = ANY(c.modulos_habilitados))
        ORDER BY q.club_id,q.profesor_id LOOP
        PERFORM _spinhouse_finanzas_bloquear(r.club_id,r.profesor_id);
      END LOOP;
      IF EXISTS (SELECT 1 FROM spinhouse_finanzas_liquidaciones l WHERE l.club_id = NEW.club_id AND l.profesor_id = NEW.profesor_id AND l.mes = extract(month FROM NEW.fecha) AND l.anio = extract(year FROM NEW.fecha)) THEN
        RAISE EXCEPTION 'El destino de esta asistencia corresponde a una liquidación cerrada';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM clubes WHERE id = OLD.club_id AND 'finanzas_spinhouse' = ANY(modulos_habilitados)) THEN
      PERFORM _spinhouse_finanzas_bloquear(OLD.club_id,OLD.profesor_id);
    END IF;
    IF EXISTS (SELECT 1 FROM spinhouse_finanzas_liquidaciones l WHERE l.club_id = OLD.club_id AND l.profesor_id = OLD.profesor_id AND l.mes = extract(month FROM OLD.fecha) AND l.anio = extract(year FROM OLD.fecha)) THEN
      RAISE EXCEPTION 'La asistencia corresponde a una liquidación cerrada';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM spinhouse_finanzas_horas WHERE asistencia_id = OLD.id)
       AND (NEW.club_id,NEW.profesor_id,NEW.bloque_id,NEW.fecha) IS DISTINCT FROM (OLD.club_id,OLD.profesor_id,OLD.bloque_id,OLD.fecha) THEN
      RAISE EXCEPTION 'La sesión ya tiene horas confirmadas; elimínala y vuelve a registrarla antes de liquidar';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER spinhouse_finanzas_asistencia_guard BEFORE UPDATE OR DELETE ON asistencia_profesores FOR EACH ROW EXECUTE FUNCTION spinhouse_finanzas_proteger_historico();
CREATE TRIGGER spinhouse_finanzas_movimiento_guard BEFORE UPDATE OR DELETE ON movimientos FOR EACH ROW EXECUTE FUNCTION spinhouse_finanzas_proteger_historico();

CREATE FUNCTION public.spinhouse_finanzas_tarifa(p_profesor uuid,p_tipo text,p_rol text,p_desde date,p_monto integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid := spinhouse_finanzas_contexto();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profesores WHERE id = p_profesor AND club_id = v_club) THEN RAISE EXCEPTION 'Profesor fuera del club'; END IF;
  PERFORM _spinhouse_finanzas_bloquear(v_club,p_profesor);
  INSERT INTO spinhouse_finanzas_tarifas(club_id,profesor_id,tipo_clase,rol,desde,monto_hora) VALUES(v_club,p_profesor,p_tipo,p_rol,p_desde,p_monto)
  ON CONFLICT (club_id,profesor_id,tipo_clase,rol,desde) DO UPDATE SET monto_hora = EXCLUDED.monto_hora;
  INSERT INTO audit_log(club_id,entity_type,entity_id,action,after,user_id) VALUES(v_club,'spinhouse_finanzas_tarifa',p_profesor,'guardar',jsonb_build_object('tipo_clase',p_tipo,'rol',p_rol,'desde',p_desde,'monto_hora',p_monto),auth.uid());
  RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.spinhouse_finanzas_confirmar_horas(p_asistencia uuid,p_minutos integer,p_tipo text,p_rol text,p_cobro_aparte boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid := spinhouse_finanzas_contexto(); v_a asistencia_profesores%ROWTYPE;
BEGIN
  IF p_cobro_aparte IS NULL THEN RAISE EXCEPTION 'Confirma si la clase se cobra aparte o está incluida en el plan'; END IF;
  SELECT * INTO v_a FROM asistencia_profesores WHERE id = p_asistencia AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asistencia fuera del club'; END IF;
  PERFORM _spinhouse_finanzas_bloquear(v_club,v_a.profesor_id);
  IF EXISTS (SELECT 1 FROM spinhouse_finanzas_liquidaciones WHERE club_id = v_club AND profesor_id = v_a.profesor_id AND mes = extract(month FROM v_a.fecha) AND anio = extract(year FROM v_a.fecha)) THEN RAISE EXCEPTION 'El periodo ya está liquidado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profesores WHERE id = v_a.profesor_id AND club_id = v_club) OR NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = v_a.bloque_id AND club_id = v_club) THEN RAISE EXCEPTION 'Profesor o bloque fuera del club'; END IF;
  INSERT INTO spinhouse_finanzas_horas(asistencia_id,club_id,minutos,tipo_clase,rol,se_cobra_aparte,confirmado_por) VALUES(p_asistencia,v_club,p_minutos,p_tipo,p_rol,p_cobro_aparte,auth.uid())
  ON CONFLICT (asistencia_id) DO UPDATE SET minutos = EXCLUDED.minutos,tipo_clase = EXCLUDED.tipo_clase,rol = EXCLUDED.rol,se_cobra_aparte = EXCLUDED.se_cobra_aparte,confirmado_por = auth.uid(),confirmado_en = now();
  INSERT INTO audit_log(club_id,entity_type,entity_id,action,after,user_id) VALUES(v_club,'spinhouse_finanzas_horas',p_asistencia,'confirmar',jsonb_build_object('minutos',p_minutos,'tipo_clase',p_tipo,'rol',p_rol,'se_cobra_aparte',p_cobro_aparte),auth.uid());
  RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.spinhouse_finanzas_asignar(p_movimiento uuid,p_bloque uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid := spinhouse_finanzas_contexto(); v_linea text;
BEGIN
  SELECT categoria INTO v_linea FROM movimientos WHERE id = p_movimiento AND club_id = v_club AND tipo = 'ingreso';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingreso fuera del club'; END IF;
  IF p_bloque IS NULL THEN DELETE FROM spinhouse_finanzas_asignaciones WHERE movimiento_id = p_movimiento AND club_id = v_club;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = p_bloque AND club_id = v_club) THEN RAISE EXCEPTION 'Bloque fuera del club'; END IF;
    -- El bloque atribuye ingresos; la categoría original conserva su negocio.
    INSERT INTO spinhouse_finanzas_asignaciones(movimiento_id,club_id,bloque_id,linea,asignado_por) VALUES(p_movimiento,v_club,p_bloque,v_linea,auth.uid())
    ON CONFLICT (movimiento_id) DO UPDATE SET bloque_id = EXCLUDED.bloque_id,linea = EXCLUDED.linea,asignado_por = auth.uid(),asignado_en = now();
  END IF;
  INSERT INTO audit_log(club_id,entity_type,entity_id,action,after,user_id) VALUES(v_club,'spinhouse_finanzas_asignacion',p_movimiento,'asignar',jsonb_build_object('bloque_id',p_bloque),auth.uid());
  RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.spinhouse_finanzas_liquidar(p_profesor uuid,p_mes integer,p_anio integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid := spinhouse_finanzas_contexto(); v_inicio date; v_fin date; v_nombre text; v_total integer := 0; v_minutos integer := 0; v_detalles jsonb := '[]'; r record; v_tarifa integer; v_costo integer; v_id uuid; v_mov uuid; v_result jsonb;
BEGIN
  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
  v_inicio := make_date(p_anio,p_mes,1); v_fin := (v_inicio + interval '1 month')::date;
  IF v_fin > (now() AT TIME ZONE 'America/Santiago')::date THEN RAISE EXCEPTION 'Solo se liquidan meses terminados'; END IF;
  PERFORM _spinhouse_finanzas_bloquear(v_club,p_profesor);
  SELECT id INTO v_id FROM spinhouse_finanzas_liquidaciones WHERE club_id = v_club AND profesor_id = p_profesor AND mes = p_mes AND anio = p_anio;
  IF FOUND THEN RETURN jsonb_build_object('liquidacion_id',v_id,'ya_liquidada',true); END IF;
  SELECT nombre INTO v_nombre FROM profesores WHERE id = p_profesor AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profesor fuera del club'; END IF;
  FOR r IN SELECT a.id,a.fecha,a.bloque_id,b.nombre bloque_nombre,h.minutos,h.tipo_clase,h.rol,h.se_cobra_aparte
    FROM asistencia_profesores a JOIN bloques_horario b ON b.id = a.bloque_id AND b.club_id = v_club
    LEFT JOIN spinhouse_finanzas_horas h ON h.asistencia_id = a.id AND h.club_id = v_club
    WHERE a.club_id = v_club AND a.profesor_id = p_profesor AND a.fecha >= v_inicio AND a.fecha < v_fin ORDER BY a.fecha,a.id LOOP
    IF r.minutos IS NULL OR (r.tipo_clase <> 'arriendo' AND r.se_cobra_aparte IS NULL) THEN RAISE EXCEPTION 'Falta confirmar las horas históricas del %',r.fecha; END IF;
    SELECT monto_hora INTO v_tarifa FROM spinhouse_finanzas_tarifas WHERE club_id = v_club AND profesor_id = p_profesor AND tipo_clase = r.tipo_clase AND rol = r.rol AND desde <= r.fecha ORDER BY desde DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Falta tarifa para % / % del %',r.tipo_clase,r.rol,r.fecha; END IF;
    v_costo := round(r.minutos * v_tarifa::numeric / 60)::integer;
    v_total := v_total + v_costo; v_minutos := v_minutos + r.minutos;
    v_detalles := v_detalles || jsonb_build_array(jsonb_build_object('asistencia_id',r.id,'fecha',r.fecha,'bloque_id',r.bloque_id,'bloque_nombre',r.bloque_nombre,'profesor_id',p_profesor,'profesor_nombre',v_nombre,'minutos',r.minutos,'tipo_clase',r.tipo_clase,'rol',r.rol,'se_cobra_aparte',r.se_cobra_aparte,'monto_hora',v_tarifa,'costo',v_costo));
  END LOOP;
  IF v_minutos = 0 THEN RAISE EXCEPTION 'No hay asistencias registradas en el periodo'; END IF;
  IF v_total > 0 THEN
    v_result := registrar_movimiento_financiero_atomico('gasto','sueldo_profesor','Liquidación mensual de ' || v_nombre,v_total,(now() AT TIME ZONE 'America/Santiago')::date,p_profesor,p_mes,p_anio,gen_random_uuid());
    v_mov := (v_result->>'movimiento_id')::uuid;
    IF v_mov IS NULL THEN RAISE EXCEPTION 'No se confirmó el gasto'; END IF;
  END IF;
  INSERT INTO spinhouse_finanzas_liquidaciones(club_id,profesor_id,profesor_nombre,mes,anio,total,minutos,detalles,movimiento_id,creado_por)
  VALUES(v_club,p_profesor,v_nombre,p_mes,p_anio,v_total,v_minutos,v_detalles,v_mov,auth.uid()) RETURNING id INTO v_id;
  INSERT INTO audit_log(club_id,entity_type,entity_id,action,after,user_id) VALUES(v_club,'spinhouse_finanzas_liquidacion',v_id,'liquidar',jsonb_build_object('total',v_total,'minutos',v_minutos,'profesor_id',p_profesor,'mes',p_mes,'anio',p_anio),auth.uid());
  RETURN jsonb_build_object('liquidacion_id',v_id,'total',v_total);
END $$;

CREATE FUNCTION public.spinhouse_finanzas_datos(p_mes integer,p_anio integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_club uuid := spinhouse_finanzas_contexto(); v_inicio date; v_fin date;
BEGIN
  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
  v_inicio := make_date(p_anio,p_mes,1); v_fin := (v_inicio + interval '1 month')::date;
  RETURN jsonb_build_object(
    'sesiones',COALESCE((SELECT jsonb_agg(jsonb_build_object('asistencia_id',a.id,'profesor_id',a.profesor_id,'profesor_nombre',p.nombre,'bloque_id',a.bloque_id,'bloque_nombre',b.nombre,'fecha',a.fecha,'minutos',h.minutos,'tipo_clase',h.tipo_clase,'rol',h.rol,'se_cobra_aparte',h.se_cobra_aparte) ORDER BY a.fecha) FROM asistencia_profesores a JOIN profesores p ON p.id = a.profesor_id AND p.club_id = v_club JOIN bloques_horario b ON b.id = a.bloque_id AND b.club_id = v_club LEFT JOIN spinhouse_finanzas_horas h ON h.asistencia_id = a.id AND h.club_id = v_club WHERE a.club_id = v_club AND a.fecha >= v_inicio AND a.fecha < v_fin),'[]'::jsonb),
    'tarifas',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM spinhouse_finanzas_tarifas t WHERE t.club_id = v_club),'[]'::jsonb),
    'ingresos',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'categoria',m.categoria,'descripcion',m.descripcion,'monto',m.monto,'bloque_id',a.bloque_id,'linea',a.linea) ORDER BY m.fecha) FROM movimientos m LEFT JOIN spinhouse_finanzas_asignaciones a ON a.movimiento_id = m.id AND a.club_id = v_club WHERE m.club_id = v_club AND m.tipo = 'ingreso' AND m.fecha >= v_inicio AND m.fecha < v_fin),'[]'::jsonb),
    'cuotas',COALESCE((SELECT jsonb_agg(jsonb_build_object('mes',m.mes,'anio',m.anio,'monto',m.monto,'estado',m.estado)) FROM mensualidades m WHERE m.club_id = v_club AND make_date(m.anio,m.mes,1) >= (v_inicio - interval '6 months')::date AND make_date(m.anio,m.mes,1) <= v_fin),'[]'::jsonb),
    'liquidaciones',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM spinhouse_finanzas_liquidaciones l WHERE l.club_id = v_club AND l.mes = p_mes AND l.anio = p_anio),'[]'::jsonb),
    'profesores',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre)) FROM profesores p WHERE p.club_id = v_club),'[]'::jsonb),
    'bloques',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'nombre',b.nombre,'tipo_clase',b.tipo_clase)) FROM bloques_horario b WHERE b.club_id = v_club),'[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.spinhouse_finanzas_tarifa(uuid,text,text,date,integer), public.spinhouse_finanzas_confirmar_horas(uuid,integer,text,text,boolean), public.spinhouse_finanzas_asignar(uuid,uuid), public.spinhouse_finanzas_liquidar(uuid,integer,integer), public.spinhouse_finanzas_datos(integer,integer), public.spinhouse_finanzas_congelar_horas(), public.spinhouse_finanzas_proteger_historico() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spinhouse_finanzas_tarifa(uuid,text,text,date,integer), public.spinhouse_finanzas_confirmar_horas(uuid,integer,text,text,boolean), public.spinhouse_finanzas_asignar(uuid,uuid), public.spinhouse_finanzas_liquidar(uuid,integer,integer), public.spinhouse_finanzas_datos(integer,integer) TO authenticated;
COMMIT;
