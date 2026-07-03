-- Función para generar mensualidades automáticamente
-- Crea una mensualidad 'pendiente' para cada jugador activo que no tenga una en el mes/año dado.
-- El monto se calcula según el plan del jugador (sesiones_limite).
-- Diseñada para ser llamada por pg_cron el día 1 de cada mes.
-- También puede llamarse manualmente: SELECT generar_mensualidades('club-uuid', 6, 2026);

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
    case j.sesiones_limite
      when 4  then 15000
      when 8  then 25000
      when 12 then 30000
      when 16 then 40000
      else 25000
    end
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
