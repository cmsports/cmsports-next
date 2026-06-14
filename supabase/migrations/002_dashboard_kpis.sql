-- Vista SQL para KPIs del dashboard admin
-- Retorna todos los indicadores en una sola llamada RPC

create or replace function dashboard_kpis(p_club_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_mes int := extract(month from current_date)::int;
  v_anio int := extract(year from current_date)::int;
  v_mes_anterior int;
  v_anio_anterior int;
  v_inicio_mes date;
  v_inicio_mes_anterior date;
  v_fin_mes_anterior date;
  v_activos bigint;
  v_activos_anterior bigint;
  v_torneos_activos bigint;
  v_morosos bigint;
  v_morosos_anterior bigint;
  v_ingresos numeric;
  v_ingresos_anterior numeric;
  v_gastos numeric;
  v_gastos_anterior numeric;
  v_solicitudes_pendientes bigint;
begin
  -- Calcular mes anterior
  if v_mes = 1 then
    v_mes_anterior := 12;
    v_anio_anterior := v_anio - 1;
  else
    v_mes_anterior := v_mes - 1;
    v_anio_anterior := v_anio;
  end if;

  v_inicio_mes := make_date(v_anio, v_mes, 1);
  v_inicio_mes_anterior := make_date(v_anio_anterior, v_mes_anterior, 1);
  v_fin_mes_anterior := v_inicio_mes - interval '1 day';

  -- Jugadores activos (actual)
  select count(*) into v_activos
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false);

  -- Jugadores activos (mes anterior, aproximación por fecha de creación)
  select count(*) into v_activos_anterior
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false)
    and creado_en::date <= v_fin_mes_anterior;

  -- Torneos en curso
  select count(*) into v_torneos_activos
  from torneos
  where club_id = p_club_id and estado = 'en_curso';

  -- Morosos mes actual
  select count(*) into v_morosos
  from mensualidades
  where club_id = p_club_id and mes = v_mes and anio = v_anio
    and (estado = 'pendiente' or estado = 'atrasado');

  -- Morosos mes anterior
  select count(*) into v_morosos_anterior
  from mensualidades
  where club_id = p_club_id and mes = v_mes_anterior and anio = v_anio_anterior
    and (estado = 'pendiente' or estado = 'atrasado');

  -- Ingresos mes actual
  select coalesce(sum(monto), 0) into v_ingresos
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso' and fecha >= v_inicio_mes::text;

  -- Ingresos mes anterior
  select coalesce(sum(monto), 0) into v_ingresos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso'
    and fecha >= v_inicio_mes_anterior::text and fecha < v_inicio_mes::text;

  -- Gastos mes actual
  select coalesce(sum(monto), 0) into v_gastos
  from movimientos
  where club_id = p_club_id and tipo = 'gasto' and fecha >= v_inicio_mes::text;

  -- Gastos mes anterior
  select coalesce(sum(monto), 0) into v_gastos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'gasto'
    and fecha >= v_inicio_mes_anterior::text and fecha < v_inicio_mes::text;

  -- Solicitudes pendientes
  select count(*) into v_solicitudes_pendientes
  from solicitudes_jugador
  where club_id = p_club_id and estado = 'pendiente';

  return json_build_object(
    'jugadores_activos', v_activos,
    'jugadores_activos_anterior', v_activos_anterior,
    'torneos_activos', v_torneos_activos,
    'morosos', v_morosos,
    'morosos_anterior', v_morosos_anterior,
    'tasa_morosidad', case when v_activos > 0 then round((v_morosos::numeric / v_activos) * 100) else 0 end,
    'tasa_morosidad_anterior', case when v_activos_anterior > 0 then round((v_morosos_anterior::numeric / v_activos_anterior) * 100) else 0 end,
    'ingresos', v_ingresos,
    'ingresos_anterior', v_ingresos_anterior,
    'gastos', v_gastos,
    'gastos_anterior', v_gastos_anterior,
    'coa', case when v_activos > 0 then round(v_gastos / v_activos) else 0 end,
    'coa_anterior', case when v_activos_anterior > 0 then round(v_gastos_anterior / v_activos_anterior) else 0 end,
    'solicitudes_pendientes', v_solicitudes_pendientes,
    'mes', v_mes,
    'anio', v_anio
  );
end;
$$;
