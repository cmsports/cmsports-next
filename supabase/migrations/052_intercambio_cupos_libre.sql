-- Antes, intercambiar_cupos_bracket_seguro solo dejaba mover cupos ya
-- emparejados (1° contra 2°), nunca un BYE (jugador_b null) ni un cabeza de
-- serie, y exigía que el intercambio fuera siempre "primero por primero" o
-- "segundo por segundo". Marcela quiere poder decidir manualmente el armado
-- inicial: mover un BYE a otro jugador (incluido un cabeza de serie) aunque
-- eso deje a los dos "segundos" que quedan libres jugando entre ellos.
-- Se mantiene: no tocar una llave ya jugada de verdad (con rival real y
-- ganador), no cruzar de mitad del cuadro, y que un grupo no se enfrente a
-- sí mismo en la misma llave.
create or replace function public.intercambiar_cupos_bracket_seguro(
  p_torneo_id uuid,
  p_partido_a_id uuid,
  p_posicion_a text,
  p_partido_b_id uuid,
  p_posicion_b text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.torneo_partidos%rowtype;
  v_b public.torneo_partidos%rowtype;
  v_torneo public.torneos%rowtype;
  v_jugador_a uuid;
  v_jugador_b uuid;
  v_grupo_a uuid;
  v_grupo_b uuid;
  v_pos_a smallint;
  v_pos_b smallint;
  v_otro_grupo_a uuid;
  v_otro_grupo_b uuid;
  v_fase_inicial text;
  v_total_llaves integer;
  v_llaves_con_orden integer;
  v_orden_minimo integer;
  v_orden_maximo integer;
begin
  if p_partido_a_id = p_partido_b_id and p_posicion_a = p_posicion_b then
    return jsonb_build_object('success', true);
  end if;
  if p_posicion_a is null or p_posicion_b is null
     or p_posicion_a not in ('jugador_a','jugador_b')
     or p_posicion_b not in ('jugador_a','jugador_b') then
    raise exception 'Cupo inválido';
  end if;

  perform 1
  from public.torneo_partidos
  where id in (p_partido_a_id, p_partido_b_id)
  order by id
  for update;

  select * into v_a
  from public.torneo_partidos
  where id = p_partido_a_id;

  select * into v_b
  from public.torneo_partidos
  where id = p_partido_b_id;

  if v_a.id is null or v_b.id is null then
    raise exception 'No se encontraron ambos cupos';
  end if;

  select * into v_torneo
  from public.torneos
  where id = p_torneo_id
  for update;

  if not found
     or auth.uid() is null
     or public.get_my_rol() is distinct from 'admin'
     or v_torneo.club_id is null
     or v_torneo.club_id is distinct from public.get_my_club_id() then
    raise exception 'Acceso denegado';
  end if;
  if v_a.torneo_id is distinct from p_torneo_id
     or v_b.torneo_id is distinct from p_torneo_id
     or v_a.fase is distinct from v_b.fase
     or v_a.fase = 'grupos' then
    raise exception 'Los cupos no pertenecen a la misma ronda';
  end if;
  -- Una llave "jugada de verdad" tiene rival real (jugador_b) y ganador; un
  -- BYE también tiene ganador (el que avanza solo) pero no rival, así que no
  -- cuenta como jugada y sí se puede seguir moviendo.
  if (v_a.jugador_b is not null and v_a.ganador is not null)
     or (v_b.jugador_b is not null and v_b.ganador is not null) then
    raise exception 'La llave ya fue jugada';
  end if;

  select p.fase into v_fase_inicial
  from public.torneo_partidos p
  where p.torneo_id = p_torneo_id
    and p.fase <> 'grupos'
  order by case p.fase
    when 'avance' then 0
    when '32vos' then 1
    when '16vos' then 2
    when '8vos' then 3
    when 'cuartos' then 4
    when 'semis' then 5
    when 'final' then 6
    else 99
  end
  limit 1;

  if v_a.fase is distinct from v_fase_inicial then
    raise exception 'Solo se edita la ronda inicial';
  end if;

  select
    count(*)::integer,
    count(p.orden)::integer,
    min(p.orden),
    max(p.orden)
  into v_total_llaves, v_llaves_con_orden, v_orden_minimo, v_orden_maximo
  from public.torneo_partidos p
  where p.torneo_id = p_torneo_id
    and p.fase = v_fase_inicial;

  if v_total_llaves < 1
     or v_llaves_con_orden <> v_total_llaves
     or v_orden_minimo <> 0
     or v_orden_maximo <> v_total_llaves - 1
     or (v_total_llaves > 1 and mod(v_total_llaves, 2) <> 0) then
    raise exception 'La ronda inicial tiene un orden inválido';
  end if;

  if v_total_llaves > 1
     and ((v_a.orden < v_total_llaves / 2)
       is distinct from (v_b.orden < v_total_llaves / 2)) then
    raise exception 'No se pueden intercambiar cupos entre mitades del bracket';
  end if;

  v_jugador_a := case
    when p_posicion_a = 'jugador_a' then v_a.jugador_a
    else v_a.jugador_b
  end;
  v_jugador_b := case
    when p_posicion_b = 'jugador_a' then v_b.jugador_a
    else v_b.jugador_b
  end;
  v_grupo_a := case
    when p_posicion_a = 'jugador_a' then v_a.slot_a_grupo_id
    else v_a.slot_b_grupo_id
  end;
  v_grupo_b := case
    when p_posicion_b = 'jugador_a' then v_b.slot_a_grupo_id
    else v_b.slot_b_grupo_id
  end;
  v_pos_a := case
    when p_posicion_a = 'jugador_a' then v_a.slot_a_posicion
    else v_a.slot_b_posicion
  end;
  v_pos_b := case
    when p_posicion_b = 'jugador_a' then v_b.slot_a_posicion
    else v_b.slot_b_posicion
  end;
  v_otro_grupo_a := case
    when p_posicion_a = 'jugador_a' then v_a.slot_b_grupo_id
    else v_a.slot_a_grupo_id
  end;
  v_otro_grupo_b := case
    when p_posicion_b = 'jugador_a' then v_b.slot_b_grupo_id
    else v_b.slot_a_grupo_id
  end;

  -- Uno de los dos lados puede estar vacío (el cupo fantasma de un BYE): eso
  -- es justamente mover el BYE. Los dos vacíos a la vez no tienen sentido, y
  -- ningún lado puede quedar sin ningún jugador tras el intercambio.
  if v_jugador_a is null and v_jugador_b is null then
    raise exception 'No hay nada que mover entre esos dos cupos';
  end if;
  if v_jugador_b is null and v_otro_grupo_a is null then
    raise exception 'Esa llave se quedaría sin ningún jugador';
  end if;
  if v_jugador_a is null and v_otro_grupo_b is null then
    raise exception 'Esa llave se quedaría sin ningún jugador';
  end if;
  if v_grupo_b = v_otro_grupo_a or v_grupo_a = v_otro_grupo_b then
    raise exception 'Un grupo no puede enfrentarse a sí mismo en la misma llave';
  end if;

  update public.torneo_partidos set
    jugador_a = case when p_posicion_a = 'jugador_a' then v_jugador_b else jugador_a end,
    jugador_b = case when p_posicion_a = 'jugador_b' then v_jugador_b else jugador_b end,
    slot_a_grupo_id = case when p_posicion_a = 'jugador_a' then v_grupo_b else slot_a_grupo_id end,
    slot_b_grupo_id = case when p_posicion_a = 'jugador_b' then v_grupo_b else slot_b_grupo_id end,
    slot_a_posicion = case when p_posicion_a = 'jugador_a' then v_pos_b else slot_a_posicion end,
    slot_b_posicion = case when p_posicion_a = 'jugador_b' then v_pos_b else slot_b_posicion end
  where id = v_a.id;

  update public.torneo_partidos set
    jugador_a = case when p_posicion_b = 'jugador_a' then v_jugador_a else jugador_a end,
    jugador_b = case when p_posicion_b = 'jugador_b' then v_jugador_a else jugador_b end,
    slot_a_grupo_id = case when p_posicion_b = 'jugador_a' then v_grupo_a else slot_a_grupo_id end,
    slot_b_grupo_id = case when p_posicion_b = 'jugador_b' then v_grupo_a else slot_b_grupo_id end,
    slot_a_posicion = case when p_posicion_b = 'jugador_a' then v_pos_a else slot_a_posicion end,
    slot_b_posicion = case when p_posicion_b = 'jugador_b' then v_pos_a else slot_b_posicion end
  where id = v_b.id;

  -- Recalcula el BYE: si tras el intercambio una llave se quedó sin rival,
  -- el que queda avanza solo; si ahora tiene rival, vuelve a quedar pendiente.
  update public.torneo_partidos
  set ganador = case when jugador_b is null then jugador_a else null end
  where id in (v_a.id, v_b.id);

  return jsonb_build_object('success', true);
end;
$$;

-- Relaja el constraint que impedía slot_a_posicion = slot_b_posicion
-- (ej. 2° vs 2°). Se mantiene la regla de que un grupo no se enfrente
-- a sí mismo.
alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_slots_coherentes_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_slots_coherentes_check
  check (
    (slot_a_grupo_id is null) = (slot_a_posicion is null)
    and (slot_b_grupo_id is null) = (slot_b_posicion is null)
    and (
      slot_a_grupo_id is null or slot_b_grupo_id is null
      or slot_a_grupo_id <> slot_b_grupo_id
    )
  );

revoke all on function public.intercambiar_cupos_bracket_seguro(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.intercambiar_cupos_bracket_seguro(
  uuid, uuid, text, uuid, text
) to authenticated;
