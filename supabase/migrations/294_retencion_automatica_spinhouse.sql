-- SOLO Spinhouse. Preparación/avisos desde hoy; bloqueos e inactivación requieren
-- 30 días de revisión y activación expresa del administrador. Ejecutar a mano.
BEGIN;
SELECT _migracion_nueva('294_retencion_automatica_spinhouse');
SELECT _migracion_para_club('Spinhouse');

CREATE TABLE public.retencion_control (
  club_id uuid PRIMARY KEY REFERENCES public.clubes(id),
  preparacion_en timestamptz NOT NULL DEFAULT now(),
  activado_en timestamptz,
  activado_por uuid
);
CREATE TABLE public.retencion_estado (
  club_id uuid NOT NULL REFERENCES public.clubes(id),
  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  inactivo boolean NOT NULL DEFAULT false,
  retirado_manual boolean NOT NULL DEFAULT false,
  bloqueado_por_mora boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(club_id,jugador_id)
);
CREATE TABLE public.retencion_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubes(id),
  jugador_id uuid REFERENCES public.jugadores(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('inactivo','reingreso','bloqueo_mora','desbloqueo_mora')),
  motivo text NOT NULL,
  fecha date,
  ocurrido_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retencion_eventos_club_fecha ON public.retencion_eventos(club_id, ocurrido_en);
CREATE TABLE public.retencion_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubes(id),
  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('deuda','faltas')),
  mensaje text NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  resuelta_en timestamptz
);
CREATE UNIQUE INDEX retencion_alerta_abierta ON public.retencion_alertas(jugador_id,tipo) WHERE resuelta_en IS NULL;

ALTER TABLE public.retencion_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencion_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencion_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencion_alertas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retencion_control,public.retencion_estado,public.retencion_eventos,public.retencion_alertas FROM anon,authenticated;
GRANT SELECT ON public.retencion_control,public.retencion_estado,public.retencion_eventos,public.retencion_alertas TO authenticated;
CREATE POLICY retencion_control_lectura ON public.retencion_control FOR SELECT TO authenticated
  USING (club_id = (SELECT public.get_my_club_id()) AND (SELECT public.get_my_rol()) IN ('admin','superadmin'));
CREATE POLICY retencion_estado_lectura ON public.retencion_estado FOR SELECT TO authenticated
  USING (club_id = (SELECT public.get_my_club_id()) AND ((SELECT public.get_my_rol()) IN ('admin','superadmin') OR jugador_id = (SELECT public.get_my_jugador_id())));
CREATE POLICY retencion_eventos_lectura ON public.retencion_eventos FOR SELECT TO authenticated
  USING (club_id = (SELECT public.get_my_club_id()) AND (SELECT public.get_my_rol()) IN ('admin','superadmin'));
CREATE POLICY retencion_alertas_lectura ON public.retencion_alertas FOR SELECT TO authenticated
  USING (club_id = (SELECT public.get_my_club_id()) AND ((SELECT public.get_my_rol()) IN ('admin','superadmin') OR (tipo = 'deuda' AND jugador_id = (SELECT public.get_my_jugador_id()))));

INSERT INTO public.retencion_control(club_id) SELECT id FROM public.clubes WHERE nombre = 'Spinhouse';
INSERT INTO public.club_config(club_id,clave,valor)
SELECT c.id,x.clave,x.valor FROM public.clubes c CROSS JOIN (VALUES
  ('morosidad.dias_aviso','15'::jsonb), ('morosidad.dias_bloqueo','31'::jsonb),
  ('retencion.faltas_alerta','3'::jsonb), ('retencion.dias_inactivo','60'::jsonb)
) x(clave,valor) WHERE c.nombre = 'Spinhouse'
ON CONFLICT(club_id,clave) DO UPDATE SET valor = EXCLUDED.valor;
-- La clave es dato de activación; un admin no puede saltarse el mes editándola:
-- el motor además exige retencion_control.activado_en, solo escribible por RPC.
INSERT INTO public.club_config(club_id,clave,valor)
SELECT id,'retencion.automatismo','"no"'::jsonb FROM public.clubes WHERE nombre = 'Spinhouse'
ON CONFLICT(club_id,clave) DO NOTHING;
UPDATE public.clubes SET modulos_habilitados = ARRAY(
  SELECT DISTINCT unnest(coalesce(modulos_habilitados,ARRAY[]::text[]) || ARRAY['retencion','retencion_automatica'])
) WHERE nombre = 'Spinhouse';

CREATE FUNCTION public._retencion_evento(p_club uuid,p_jugador uuid,p_tipo text,p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  INSERT INTO public.retencion_eventos(club_id,jugador_id,tipo,motivo) VALUES(p_club,p_jugador,p_tipo,p_motivo);
  INSERT INTO public.audit_log(club_id,entity_type,entity_id,action,after,user_id)
  VALUES(p_club,'retencion',p_jugador,p_tipo,jsonb_build_object('motivo',p_motivo,'origen','retencion_automatica'),auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public._retencion_evento(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

-- El panel general puede pausar ('no'); activar siempre pasa por la revisión
-- registrada. Ni modificar la clave directamente permite saltarse ese plazo.
CREATE FUNCTION public._retencion_guarda_activacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.clave='retencion.automatismo' AND NEW.valor='"si"'::jsonb AND NOT EXISTS(
    SELECT 1 FROM public.retencion_control WHERE club_id=NEW.club_id
      AND activado_en IS NOT NULL AND activado_en>=preparacion_en+interval '30 days'
  ) THEN RAISE EXCEPTION 'Activa la retención desde su panel, tras 30 días de revisión'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._retencion_guarda_activacion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retencion_guarda_activacion BEFORE INSERT OR UPDATE ON public.club_config
FOR EACH ROW EXECUTE FUNCTION public._retencion_guarda_activacion();

-- Un cambio manual, incluso reafirmar 'bloqueado', toma propiedad del bloqueo.
-- El motor jamás desbloquea después un bloqueo que el admin hizo suyo.
CREATE FUNCTION public._retencion_estado_manual()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF coalesce(current_setting('cmsports.retencion_ejecutando',true),'') <> 'si' THEN
    UPDATE public.retencion_estado SET bloqueado_por_mora=false,actualizado_en=now()
    WHERE jugador_id=NEW.id AND club_id=NEW.club_id AND bloqueado_por_mora;
    IF FOUND THEN
      INSERT INTO public.audit_log(club_id,entity_type,entity_id,action,after,user_id)
        VALUES(NEW.club_id,'retencion',NEW.id,'estado_manual',jsonb_build_object('estado',NEW.estado,'bloqueado_por_mora',false),auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._retencion_estado_manual() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retencion_preserva_bloqueo_manual AFTER UPDATE OF estado ON public.jugadores
FOR EACH ROW EXECUTE FUNCTION public._retencion_estado_manual();

CREATE FUNCTION public._procesar_retencion_club(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE
  j record; s public.retencion_estado%ROWTYPE;
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_vencimiento int; v_aviso int; v_bloqueo int; v_faltas_umbral int; v_inactivo_umbral int;
  v_automatico boolean; v_ultima date; v_presencia date; v_pago date; v_reingreso date; v_retiro date;
  v_mora int; v_faltas int; v_inactivo boolean; v_desde_falta date; v_n int := 0;
BEGIN
  -- Opt-in por módulo: no se procesa ni una persona de otros clubes.
  IF NOT EXISTS(SELECT 1 FROM public.clubes WHERE id=p_club AND 'retencion_automatica'=ANY(modulos_habilitados)) THEN
    RAISE EXCEPTION 'Retención automática no habilitada para este club';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retencion:'||p_club::text,0));
  v_vencimiento := greatest(1,least(28,public._config_texto(p_club,'morosidad.dia_vencimiento','1')::int));
  v_aviso := public._config_texto(p_club,'morosidad.dias_aviso','0')::int;
  v_bloqueo := public._config_texto(p_club,'morosidad.dias_bloqueo','0')::int;
  v_faltas_umbral := public._config_texto(p_club,'retencion.faltas_alerta','0')::int;
  v_inactivo_umbral := public._config_texto(p_club,'retencion.dias_inactivo','0')::int;
  v_automatico := public._config_texto(p_club,'retencion.automatismo','no')='si'
    AND EXISTS(SELECT 1 FROM public.retencion_control WHERE club_id=p_club AND activado_en IS NOT NULL);
  PERFORM set_config('cmsports.retencion_ejecutando','si',true);

  FOR j IN SELECT * FROM public.jugadores WHERE club_id=p_club AND coalesce(es_externo,false)=false
    AND estado IN ('activo','bloqueado') ORDER BY id FOR UPDATE LOOP
    INSERT INTO public.retencion_estado(club_id,jugador_id) VALUES(p_club,j.id) ON CONFLICT(club_id,jugador_id) DO NOTHING;
    SELECT * INTO STRICT s FROM public.retencion_estado WHERE club_id=p_club AND jugador_id=j.id FOR UPDATE;
    SELECT greatest(0,v_hoy-min(make_date(anio,mes,v_vencimiento))) INTO v_mora
    FROM public.mensualidades WHERE club_id=p_club AND jugador_id=j.id AND monto>0
      AND lower(coalesce(estado,'')) NOT IN ('pagado','pagada','exento','exenta','anulado','anulada','condonado','condonada');
    v_mora := coalesce(v_mora,0);
    SELECT max(fecha) INTO v_presencia FROM public.asistencia
      WHERE club_id=p_club AND jugador_id=j.id AND estado='presente' AND fecha<=v_hoy;
    SELECT max(fecha_pago::date) INTO v_pago FROM public.mensualidades
      WHERE club_id=p_club AND jugador_id=j.id AND fecha_pago IS NOT NULL AND fecha_pago::date<=v_hoy
        AND lower(coalesce(estado,'')) IN ('pagado','pagada');
    SELECT greatest(v_pago,max(fecha)) INTO v_pago FROM public.movimientos
      WHERE club_id=p_club AND jugador_id=j.id AND tipo='ingreso' AND monto>0 AND fecha<=v_hoy;
    SELECT max(coalesce(fecha,(ocurrido_en AT TIME ZONE 'America/Santiago')::date)) INTO v_reingreso
      FROM public.retencion_eventos WHERE club_id=p_club AND jugador_id=j.id AND tipo='reingreso';
    SELECT max(coalesce(fecha,(ocurrido_en AT TIME ZONE 'America/Santiago')::date)) INTO v_retiro
      FROM public.retencion_eventos WHERE club_id=p_club AND jugador_id=j.id AND tipo='retiro';
    v_ultima := greatest(v_presencia,v_pago,v_reingreso,(j.creado_en AT TIME ZONE 'America/Santiago')::date);
    v_inactivo := v_inactivo_umbral>0 AND v_ultima IS NOT NULL AND v_hoy-v_ultima>=v_inactivo_umbral;
    IF s.retirado_manual AND greatest(v_presencia,v_pago) IS NOT NULL
      AND greatest(v_presencia,v_pago)>coalesce(v_retiro,(s.actualizado_en AT TIME ZONE 'America/Santiago')::date) THEN
      v_inactivo := false;
    ELSIF s.retirado_manual THEN
      v_inactivo := true;
    END IF;
    -- La racha cuenta registros reales; una fecha sin lista nunca es falta.
    SELECT max(fecha) INTO v_desde_falta FROM public.asistencia
      WHERE club_id=p_club AND jugador_id=j.id AND estado='presente' AND fecha<=v_hoy;
    SELECT count(DISTINCT fecha) INTO v_faltas FROM public.asistencia
      WHERE club_id=p_club AND jugador_id=j.id AND estado IN ('ausente','falta') AND fecha<=v_hoy
        AND (v_desde_falta IS NULL OR fecha>v_desde_falta);
    IF v_aviso>0 AND v_mora>=v_aviso THEN
      INSERT INTO public.retencion_alertas(club_id,jugador_id,tipo,mensaje)
      VALUES(p_club,j.id,'deuda','Tu mensualidad lleva '||v_mora||' días de atraso. Contacta a administración para regularizar tu cuenta.')
      ON CONFLICT(jugador_id,tipo) WHERE resuelta_en IS NULL DO UPDATE SET mensaje=EXCLUDED.mensaje;
    ELSE
      UPDATE public.retencion_alertas SET resuelta_en=now() WHERE club_id=p_club AND jugador_id=j.id AND tipo='deuda' AND resuelta_en IS NULL;
    END IF;
    IF v_faltas_umbral>0 AND v_faltas>=v_faltas_umbral THEN
      INSERT INTO public.retencion_alertas(club_id,jugador_id,tipo,mensaje)
      VALUES(p_club,j.id,'faltas',v_faltas||' clases seguidas sin asistir. Contactar al alumno o apoderado.')
      ON CONFLICT(jugador_id,tipo) WHERE resuelta_en IS NULL DO UPDATE SET mensaje=EXCLUDED.mensaje;
    ELSE
      UPDATE public.retencion_alertas SET resuelta_en=now() WHERE club_id=p_club AND jugador_id=j.id AND tipo='faltas' AND resuelta_en IS NULL;
    END IF;
    IF NOT v_automatico THEN CONTINUE; END IF;
    IF v_inactivo IS DISTINCT FROM s.inactivo THEN
      UPDATE public.retencion_estado SET inactivo=v_inactivo,retirado_manual=false,actualizado_en=now() WHERE jugador_id=j.id AND club_id=p_club;
      PERFORM public._retencion_evento(p_club,j.id,CASE WHEN v_inactivo THEN 'inactivo' ELSE 'reingreso' END,
        CASE WHEN v_inactivo THEN v_inactivo_umbral||' días sin asistencia presente ni pago' ELSE 'Nueva asistencia, pago o revisión de umbrales' END);
      v_n := v_n+1;
    END IF;
    -- NUNCA se bloquea por faltas ni por inactividad.
    IF v_bloqueo>0 AND v_mora>=v_bloqueo AND j.estado='activo' THEN
      UPDATE public.jugadores SET estado='bloqueado' WHERE id=j.id AND club_id=p_club;
      UPDATE public.retencion_estado SET bloqueado_por_mora=true,actualizado_en=now() WHERE jugador_id=j.id AND club_id=p_club;
      PERFORM public._retencion_evento(p_club,j.id,'bloqueo_mora',v_mora||' días de mora');
      v_n := v_n+1;
    ELSIF s.bloqueado_por_mora AND (v_bloqueo=0 OR v_mora<v_bloqueo) AND j.estado='bloqueado' THEN
      UPDATE public.jugadores SET estado='activo' WHERE id=j.id AND club_id=p_club;
      UPDATE public.retencion_estado SET bloqueado_por_mora=false,actualizado_en=now() WHERE jugador_id=j.id AND club_id=p_club;
      PERFORM public._retencion_evento(p_club,j.id,'desbloqueo_mora','Deuda regularizada o umbral desactivado; bloqueo de origen automático');
      v_n := v_n+1;
    END IF;
  END LOOP;
  PERFORM set_config('cmsports.retencion_ejecutando','no',true);
  RETURN jsonb_build_object('automatico',v_automatico,'cambios',v_n,'fecha',v_hoy);
END;
$$;
REVOKE ALL ON FUNCTION public._procesar_retencion_club(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ejecutar_retencion_club()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_my_rol() NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  RETURN public._procesar_retencion_club(public.get_my_club_id());
END;
$$;
REVOKE ALL ON FUNCTION public.ejecutar_retencion_club() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejecutar_retencion_club() TO authenticated;

CREATE FUNCTION public.activar_retencion_club(p_revision_confirmada boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE v_club uuid := public.get_my_club_id(); v_inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_rol() NOT IN ('admin','superadmin') OR p_revision_confirmada IS NOT TRUE THEN RAISE EXCEPTION 'Confirma la revisión del padrón como administrador'; END IF;
  SELECT preparacion_en INTO v_inicio FROM public.retencion_control WHERE club_id=v_club FOR UPDATE;
  IF v_inicio IS NULL OR now()<v_inicio+interval '30 days' THEN RAISE EXCEPTION 'La revisión debe durar al menos 30 días desde la preparación'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clubes WHERE id=v_club AND 'retencion_automatica'=ANY(modulos_habilitados)) THEN RAISE EXCEPTION 'Módulo no habilitado'; END IF;
  UPDATE public.retencion_control SET activado_en=now(),activado_por=auth.uid() WHERE club_id=v_club;
  INSERT INTO public.club_config(club_id,clave,valor) VALUES(v_club,'retencion.automatismo','"si"'::jsonb)
    ON CONFLICT(club_id,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.audit_log(club_id,entity_type,entity_id,action,after,user_id)
    VALUES(v_club,'retencion_control',v_club,'activar',jsonb_build_object('revision_confirmada',true,'preparacion_en',v_inicio),auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.activar_retencion_club(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activar_retencion_club(boolean) TO authenticated;

CREATE FUNCTION public.procesar_retencion_automatica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE c record; v_resultado jsonb := '{}'::jsonb;
BEGIN
  FOR c IN SELECT id FROM public.clubes WHERE 'retencion_automatica'=ANY(modulos_habilitados) LOOP
    v_resultado := v_resultado||jsonb_build_object(c.id::text,public._procesar_retencion_club(c.id));
  END LOOP;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.procesar_retencion_automatica() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['retencion_estado','retencion_alertas','retencion_eventos','retencion_control'] LOOP
    IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(
      SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('retencion-spinhouse','15 4 * * *','SELECT public.procesar_retencion_automatica()');
  ELSE
    RAISE NOTICE 'Habilitar pg_cron y programar: SELECT cron.schedule(''retencion-spinhouse'',''15 4 * * *'',''SELECT public.procesar_retencion_automatica()'');';
  END IF;
END;
$$;

-- Las filas históricas permanecen. Solo los clubes con el módulo excluyen
-- su estado de retención del padrón activo y de nuevas cuotas.
CREATE FUNCTION public._jugador_inactivo_retencion(p_club uuid,p_jugador uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.clubes c JOIN public.retencion_estado r ON r.club_id=c.id
    WHERE c.id=p_club AND r.jugador_id=p_jugador AND r.inactivo
      AND 'retencion_automatica'=ANY(c.modulos_habilitados));
$$;
REVOKE ALL ON FUNCTION public._jugador_inactivo_retencion(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Base: 209_morosos_solo_activos.sql; añade exclusivamente el filtro por estado de retención.
CREATE OR REPLACE FUNCTION dashboard_kpis(p_club_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_mes                  int := extract(month from (now() at time zone 'America/Santiago')::date)::int;
  v_anio                 int := extract(year from (now() at time zone 'America/Santiago')::date)::int;
  v_mes_anterior         int;
  v_anio_anterior        int;
  v_inicio_mes           date;
  v_inicio_mes_anterior  date;
  v_fin_mes_anterior     date;

  v_activos              bigint;
  v_activos_anterior     bigint;
  v_torneos_activos      bigint;
  v_morosos              bigint;
  v_morosos_anterior     bigint;
  v_ingresos             numeric;
  v_ingresos_anterior    numeric;
  v_gastos               numeric;
  v_gastos_anterior      numeric;
  v_solicitudes_pendientes bigint;

  v_morosos_lista        json;
  v_solicitudes_lista    json;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  if v_mes = 1 then
    v_mes_anterior  := 12;
    v_anio_anterior := v_anio - 1;
  else
    v_mes_anterior  := v_mes - 1;
    v_anio_anterior := v_anio;
  end if;

  v_inicio_mes          := make_date(v_anio, v_mes, 1);
  v_inicio_mes_anterior := make_date(v_anio_anterior, v_mes_anterior, 1);
  v_fin_mes_anterior    := v_inicio_mes - interval '1 day';

  select count(*) into v_activos
  from jugadores
  where club_id = p_club_id and estado = 'activo' and not public._jugador_inactivo_retencion(jugadores.club_id,jugadores.id) and (es_externo is null or es_externo = false);

  select count(*) into v_activos_anterior
  from jugadores
  where club_id = p_club_id and estado = 'activo' and not public._jugador_inactivo_retencion(jugadores.club_id,jugadores.id) and (es_externo is null or es_externo = false)
    and creado_en::date <= v_fin_mes_anterior;

  select count(*) into v_torneos_activos
  from torneos
  where club_id = p_club_id and estado = 'en_curso';

  -- Morosidad: solo cuenta si el jugador SIGUE activo hoy. Bloquear a alguien
  -- no cierra su cuota pendiente en `mensualidades`, así que sin este filtro
  -- se le sigue "cobrando" en el dashboard después de bloqueado.
  select count(*) into v_morosos
  from mensualidades men
  join jugadores j on j.id = men.jugador_id
  where men.club_id = p_club_id and men.mes = v_mes and men.anio = v_anio
    and (men.estado = 'pendiente' or men.estado = 'atrasado')
    and j.estado = 'activo' and not public._jugador_inactivo_retencion(j.club_id,j.id) and (j.es_externo is null or j.es_externo = false);

  select count(*) into v_morosos_anterior
  from mensualidades men
  join jugadores j on j.id = men.jugador_id
  where men.club_id = p_club_id and men.mes = v_mes_anterior and men.anio = v_anio_anterior
    and (men.estado = 'pendiente' or men.estado = 'atrasado')
    and j.estado = 'activo' and not public._jugador_inactivo_retencion(j.club_id,j.id) and (j.es_externo is null or j.es_externo = false);

  select coalesce(sum(monto), 0) into v_ingresos
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso' and fecha >= v_inicio_mes;

  select coalesce(sum(monto), 0) into v_ingresos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso'
    and fecha >= v_inicio_mes_anterior and fecha < v_inicio_mes;

  select coalesce(sum(monto), 0) into v_gastos
  from movimientos
  where club_id = p_club_id and tipo = 'gasto' and fecha >= v_inicio_mes;

  select coalesce(sum(monto), 0) into v_gastos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'gasto'
    and fecha >= v_inicio_mes_anterior and fecha < v_inicio_mes;

  select count(*) into v_solicitudes_pendientes
  from solicitudes_jugador
  where club_id = p_club_id and estado = 'pendiente';

  -- Misma razón que v_morosos: sin filtrar j.estado, un jugador bloqueado
  -- seguía apareciendo con nombre y teléfono en la lista de deudores.
  select json_agg(m) into v_morosos_lista
  from (
    select men.id, men.jugador_id, men.estado, j.nombre, j.telefono
    from mensualidades men
    join jugadores j on j.id = men.jugador_id
    where men.club_id = p_club_id
      and men.mes = v_mes and men.anio = v_anio
      and (men.estado = 'pendiente' or men.estado = 'atrasado')
      and j.estado = 'activo' and not public._jugador_inactivo_retencion(j.club_id,j.id) and (j.es_externo is null or j.es_externo = false)
  ) m;

  select json_agg(s order by s.creado_en desc) into v_solicitudes_lista
  from (
    select id, nombre, rut, email, telefono, creado_en
    from solicitudes_jugador
    where club_id = p_club_id and estado = 'pendiente'
  ) s;

  return json_build_object(
    'jugadores_activos',        v_activos,
    'jugadores_activos_anterior', v_activos_anterior,
    'torneos_activos',          v_torneos_activos,
    'morosos',                  v_morosos,
    'morosos_anterior',         v_morosos_anterior,
    'tasa_morosidad',           case when v_activos > 0 then round((v_morosos::numeric / v_activos) * 100) else 0 end,
    'tasa_morosidad_anterior',  case when v_activos_anterior > 0 then round((v_morosos_anterior::numeric / v_activos_anterior) * 100) else 0 end,
    'ingresos',                 v_ingresos,
    'ingresos_anterior',        v_ingresos_anterior,
    'gastos',                   v_gastos,
    'gastos_anterior',          v_gastos_anterior,
    'coa',                      case when v_activos > 0 then round(v_gastos / v_activos) else 0 end,
    'coa_anterior',             case when v_activos_anterior > 0 then round(v_gastos_anterior / v_activos_anterior) else 0 end,
    'solicitudes_pendientes',   v_solicitudes_pendientes,
    'morosos_lista',            coalesce(v_morosos_lista, '[]'::json),
    'solicitudes_lista',        coalesce(v_solicitudes_lista, '[]'::json),
    'mes',                      v_mes,
    'anio',                     v_anio
  );
end;
$$;

-- Base: 286_emision_automatica_por_club.sql; añade exclusivamente el filtro por estado de retención.
CREATE OR REPLACE FUNCTION public.emitir_mensualidades_mes_actual(p_club_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy  date    := (now() AT TIME ZONE 'America/Santiago')::date;
  v_mes  integer := extract(month from v_hoy)::integer;
  v_anio integer := extract(year  from v_hoy)::integer;
  v_insertadas integer;
BEGIN
  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT j.club_id, j.id, v_mes, v_anio, 'pendiente',
    CASE
      WHEN public._config_texto(j.club_id, 'mensualidad.modo', 'monto_libre') = 'por_plan'
        THEN coalesce(pl.monto, j.mensualidad)
      ELSE j.mensualidad
    END
  FROM public.jugadores j
  LEFT JOIN public.planes_club pl
    ON pl.id = j.plan_id AND pl.club_id = j.club_id
  WHERE j.club_id IS NOT NULL
    AND (p_club_id IS NULL OR j.club_id = p_club_id)
    AND j.estado = 'activo' AND NOT public._jugador_inactivo_retencion(j.club_id,j.id)
    AND (j.es_externo IS NULL OR j.es_externo = false)
    AND (j.cobrar_desde IS NULL
         OR make_date(v_anio, v_mes, 1) >= date_trunc('month', j.cobrar_desde)::date)
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

-- Base: 252_planes_de_mensualidad.sql; añade exclusivamente el filtro por estado de retención.
CREATE OR REPLACE FUNCTION generar_mensualidades(p_club_id uuid, p_mes integer, p_anio integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_insertados int := 0;
  v_modo       text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  v_modo := _config_texto(p_club_id, 'mensualidad.modo', 'monto_libre');

  insert into mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  select
    p_club_id,
    j.id,
    p_mes,
    p_anio,
    'pendiente',
    case
      -- Con planes: la tarifa del plan, y si no tiene plan cae a su monto
      -- propio. Si no tiene ninguno de los dos, nace SIN MONTO — nunca un
      -- valor inventado (migración 097).
      when v_modo = 'por_plan' then coalesce(pl.monto, j.mensualidad)
      -- Sin planes: exactamente como hasta hoy.
      else j.mensualidad
    end
  from jugadores j
  left join planes_club pl
    on v_modo = 'por_plan'
   and pl.id = j.plan_id
   and pl.club_id = p_club_id
  where j.club_id = p_club_id
    and j.estado = 'activo' AND NOT public._jugador_inactivo_retencion(j.club_id,j.id)
    and (j.es_externo is null or j.es_externo = false)
    and not exists (
      select 1 from mensualidades m
      where m.jugador_id = j.id
        and m.club_id = p_club_id
        and m.mes = p_mes
        and m.anio = p_anio
    );

  get diagnostics v_insertados = row_count;

  return json_build_object(
    'club_id', p_club_id,
    'mes', p_mes,
    'anio', p_anio,
    'modo', v_modo,
    'mensualidades_creadas', v_insertados
  );
end;
$$;

-- Base: 204_cobrar_desde.sql; añade exclusivamente el filtro por estado de retención.
CREATE OR REPLACE FUNCTION public.generar_mensualidades_jugadores_seguro(
  p_jugador_ids uuid[],
  p_mes integer,
  p_anio integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club_id     uuid;
  v_user_id     uuid;
  v_admin_nombre text;
  v_insertadas  integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_mes IS NULL OR p_anio IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Mes o año inválido';
  END IF;

  IF p_jugador_ids IS NULL OR cardinality(p_jugador_ids) > 1000 OR array_position(p_jugador_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Lista de jugadores inválida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_jugador_ids) AS input(jugador_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = input.jugador_id AND j.club_id = v_club_id)
  ) THEN RAISE EXCEPTION 'Uno o más jugadores no pertenecen al club'; END IF;

  INSERT INTO public.mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  SELECT DISTINCT v_club_id, j.id, p_mes, p_anio, 'pendiente', j.mensualidad
  FROM public.jugadores j
  JOIN unnest(p_jugador_ids) AS input(jugador_id) ON input.jugador_id = j.id
  WHERE j.club_id = v_club_id
    AND NOT public._jugador_inactivo_retencion(j.club_id,j.id)
    AND (j.cobrar_desde IS NULL
         OR make_date(p_anio, p_mes, 1) >= date_trunc('month', j.cobrar_desde)::date)
  ON CONFLICT (club_id, jugador_id, mes, anio)
    WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

COMMIT;
