-- Plan personalizado por jugador.
-- Agrega los campos que definen el plan acordado con cada jugador al aprobar la solicitud:
--   mensualidad: monto cobrado en CLP (puede venir de planes precargados o ser personalizado)
--   tipo_plan: modalidad — mensual | semanal | libre
--   entrenamientos_por_semana: cupos semanales (ignorado cuando tipo_plan = 'libre')
-- Backfill conservador: los jugadores existentes quedan en plan "mensual" con la mensualidad
-- que ya se les estaba cobrando según sesiones_limite (mismo mapeo que usaba generar_mensualidades).

alter table jugadores
  add column if not exists mensualidad numeric,
  add column if not exists tipo_plan text,
  add column if not exists entrenamientos_por_semana int;

alter table jugadores
  drop constraint if exists jugadores_tipo_plan_check;
alter table jugadores
  add constraint jugadores_tipo_plan_check
  check (tipo_plan is null or tipo_plan in ('mensual','semanal','libre'));

update jugadores
set
  mensualidad = coalesce(mensualidad, case sesiones_limite
    when 4  then 15000
    when 8  then 25000
    when 12 then 30000
    when 16 then 40000
    else 25000
  end),
  tipo_plan = coalesce(tipo_plan, 'mensual'),
  entrenamientos_por_semana = coalesce(
    entrenamientos_por_semana,
    greatest(1, round(coalesce(sesiones_limite, 12) / 4.0))::int
  )
where mensualidad is null
   or tipo_plan is null
   or entrenamientos_por_semana is null;

-- generar_mensualidades ahora prefiere jugadores.mensualidad cuando está definida.
-- Cae al mapeo viejo por sesiones_limite si la columna nueva fuese null.
create or replace function generar_mensualidades(
  p_club_id uuid,
  p_mes int default extract(month from current_date)::int,
  p_anio int default extract(year from current_date)::int
)
returns json
language plpgsql
security definer
as $$
declare
  v_insertados int := 0;
begin
  insert into mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  select
    p_club_id,
    j.id,
    p_mes,
    p_anio,
    'pendiente',
    coalesce(j.mensualidad, case j.sesiones_limite
      when 4  then 15000
      when 8  then 25000
      when 12 then 30000
      when 16 then 40000
      else 25000
    end)
  from jugadores j
  where j.club_id = p_club_id
    and j.estado = 'activo'
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
    'mensualidades_creadas', v_insertados
  );
end;
$$;
