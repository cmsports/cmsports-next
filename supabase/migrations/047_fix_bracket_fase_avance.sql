-- Fix: el RPC no debe lanzar excepción cuando el árbol siguiente está incompleto.
-- Si hay grupos abiertos o cupos pendientes, simplemente no se avanza la fase
-- (se avanzará cuando sincronizarLlaves detecte el estado final). La excepción
-- anterior revertía toda la transacción incluyendo el ganador ya marcado, dejando
-- el bracket bloqueado sin poder completar la última llave de una fase.

create or replace function public.marcar_ganador_playoff_seguro(
  p_partido_id uuid,
  p_ganador_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partido public.torneo_partidos%rowtype;
  v_torneo public.torneos%rowtype;
  v_fase_siguiente text;
  v_orden_siguiente integer;
  v_es_slot_a boolean;
  v_next_id uuid;
  v_total_actual integer;
  v_resueltos_actual integer;
  v_total_siguiente integer;
  v_completos_siguiente integer;
begin
  select * into v_partido from public.torneo_partidos where id = p_partido_id for update;
  if not found then raise exception 'Partido no encontrado'; end if;
  select * into v_torneo from public.torneos where id = v_partido.torneo_id for update;
  if not found
     or auth.uid() is null
     or public.get_my_rol() is distinct from 'admin'
     or v_torneo.club_id is null
     or v_torneo.club_id is distinct from public.get_my_club_id() then
    raise exception 'Acceso denegado';
  end if;
  if v_partido.fase is null or v_partido.fase not in ('avance','32vos','16vos','8vos','cuartos','semis','final') then
    raise exception 'Fase de playoff inválida';
  end if;
  if v_partido.orden is null or v_partido.orden < 0 then raise exception 'Orden de llave inválido'; end if;
  if v_partido.fase = 'final' and v_partido.orden <> 0 then raise exception 'Orden de final inválido'; end if;
  if v_partido.ganador is not null then raise exception 'El partido ya tiene ganador'; end if;
  if v_partido.jugador_a is null or v_partido.jugador_b is null then raise exception 'Los BYE avanzan automáticamente'; end if;
  if p_ganador_id is distinct from v_partido.jugador_a and p_ganador_id is distinct from v_partido.jugador_b then
    raise exception 'El ganador debe pertenecer al partido';
  end if;

  update public.torneo_partidos set ganador = p_ganador_id where id = p_partido_id;
  v_fase_siguiente := case v_partido.fase
    when 'avance' then '32vos'
    when '32vos' then '16vos'
    when '16vos' then '8vos'
    when '8vos' then 'cuartos'
    when 'cuartos' then 'semis'
    when 'semis' then 'final'
    else null
  end;

  if v_fase_siguiente is not null then
    v_orden_siguiente := floor(v_partido.orden / 2.0)::integer;
    v_es_slot_a := mod(v_partido.orden, 2) = 0;
    insert into public.torneo_partidos (torneo_id, fase, orden, jugador_a, jugador_b, ganador)
    values (
      v_partido.torneo_id, v_fase_siguiente, v_orden_siguiente,
      case when v_es_slot_a then p_ganador_id else null end,
      case when v_es_slot_a then null else p_ganador_id end,
      null
    )
    on conflict (torneo_id, fase, orden) where fase <> 'grupos'
    do update set
      jugador_a = case when v_es_slot_a then excluded.jugador_a else torneo_partidos.jugador_a end,
      jugador_b = case when not v_es_slot_a then excluded.jugador_b else torneo_partidos.jugador_b end
    where torneo_partidos.ganador is null
      and case when v_es_slot_a
        then torneo_partidos.jugador_a is null or torneo_partidos.jugador_a = p_ganador_id
        else torneo_partidos.jugador_b is null or torneo_partidos.jugador_b = p_ganador_id
      end
    returning id into v_next_id;
    if v_next_id is null then raise exception 'La llave siguiente ya fue jugada o contiene otro ganador'; end if;

    select count(*), count(*) filter (where ganador is not null)
      into v_total_actual, v_resueltos_actual
    from public.torneo_partidos
    where torneo_id = v_partido.torneo_id and fase = v_partido.fase;

    if v_torneo.fase = v_partido.fase
       and v_total_actual > 0
       and v_total_actual = v_resueltos_actual then
      select count(*), count(*) filter (where jugador_a is not null and jugador_b is not null)
        into v_total_siguiente, v_completos_siguiente
      from public.torneo_partidos
      where torneo_id = v_partido.torneo_id and fase = v_fase_siguiente;
      -- Solo avanzar fase si el árbol siguiente está íntegro. Si hay grupos aún
      -- abiertos los cupos se completarán luego y sincronizarLlaves avanzará
      -- la fase cuando corresponda. No lanzar excepción: eso revertía el ganador.
      if v_total_siguiente = v_total_actual / 2 and v_completos_siguiente = v_total_siguiente then
        update public.torneos set fase = v_fase_siguiente
        where id = v_partido.torneo_id and fase = v_partido.fase;
      end if;
    end if;
  end if;

  return jsonb_build_object('success', true);
end;
$$;
