-- Persistencia de desempates y garantías del árbol de playoffs.

alter table public.torneo_grupos
  add column if not exists desempate_primero_id uuid references public.jugadores(id) on delete set null,
  add column if not exists desempate_segundo_id uuid references public.jugadores(id) on delete set null,
  add column if not exists orden integer;

with ordenados as (
  select id,
         row_number() over (
           partition by torneo_id
           order by creado_en nulls last, nombre nulls last, id
         ) - 1 as nuevo_orden
  from public.torneo_grupos
  where nombre is distinct from 'MESA'
)
update public.torneo_grupos g
set orden = o.nuevo_orden
from ordenados o
where g.id = o.id and g.orden is null;

alter table public.torneo_grupos
  drop constraint if exists torneo_grupos_orden_no_negativo_check;
alter table public.torneo_grupos
  add constraint torneo_grupos_orden_no_negativo_check
  check (orden is null or orden >= 0);

create unique index if not exists torneo_grupos_torneo_orden_uidx
  on public.torneo_grupos (torneo_id, orden)
  where nombre is distinct from 'MESA' and orden is not null;

alter table public.torneo_grupos
  drop constraint if exists torneo_grupos_desempate_distinto_check;
alter table public.torneo_grupos
  add constraint torneo_grupos_desempate_distinto_check
  check (
    desempate_primero_id is null
    or desempate_segundo_id is null
    or desempate_primero_id <> desempate_segundo_id
  );

-- Cada lado conserva el cupo de origen. Así los grupos pendientes completan
-- el mismo árbol y un ajuste manual no se pierde al cerrar otros grupos.
alter table public.torneo_partidos
  add column if not exists slot_a_grupo_id uuid references public.torneo_grupos(id) on delete set null,
  add column if not exists slot_a_posicion smallint,
  add column if not exists slot_b_grupo_id uuid references public.torneo_grupos(id) on delete set null,
  add column if not exists slot_b_posicion smallint;

alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_slot_a_posicion_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_slot_a_posicion_check
  check (slot_a_posicion is null or slot_a_posicion in (1, 2));

alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_slot_b_posicion_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_slot_b_posicion_check
  check (slot_b_posicion is null or slot_b_posicion in (1, 2));

alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_slots_coherentes_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_slots_coherentes_check
  check (
    (slot_a_grupo_id is null) = (slot_a_posicion is null)
    and (slot_b_grupo_id is null) = (slot_b_posicion is null)
    and (
      slot_a_grupo_id is null or slot_b_grupo_id is null
      or (slot_a_grupo_id <> slot_b_grupo_id and slot_a_posicion <> slot_b_posicion)
    )
  );

alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_ganador_participante_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_ganador_participante_check
  check (
    ganador is null
    or ganador is not distinct from jugador_a
    or ganador is not distinct from jugador_b
  );

alter table public.torneo_partidos
  drop constraint if exists torneo_partidos_jugadores_distintos_check;
alter table public.torneo_partidos
  add constraint torneo_partidos_jugadores_distintos_check
  check (jugador_a is null or jugador_b is null or jugador_a <> jugador_b);

create unique index if not exists torneo_partidos_playoff_ronda_orden_uidx
  on public.torneo_partidos (torneo_id, fase, orden)
  where fase <> 'grupos';

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

  -- El cuadro puede convivir con grupos aún abiertos. Una rama completa puede
  -- jugarse antes sin cambiar prematuramente la fase global del torneo.
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
      -- Solo avanzar fase si el árbol siguiente está íntegro; si aún hay grupos
      -- abiertos o cupos pendientes, los siguientes partidos se completarán más
      -- tarde y la fase avanzará cuando sincronizarLlaves detecte el estado final.
      if v_total_siguiente = v_total_actual / 2 and v_completos_siguiente = v_total_siguiente then
        update public.torneos set fase = v_fase_siguiente
        where id = v_partido.torneo_id and fase = v_partido.fase;
      end if;
    end if;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.corregir_resultado_playoff_seguro(
  p_partido_id uuid,
  p_nuevo_ganador_id uuid
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
  v_siguiente public.torneo_partidos%rowtype;
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
  if v_torneo.estado = 'finalizado' then raise exception 'Reabre el torneo antes de corregir la final'; end if;
  if v_partido.fase is null or v_partido.fase not in ('avance','32vos','16vos','8vos','cuartos','semis','final') then
    raise exception 'Fase de playoff inválida';
  end if;
  if v_partido.orden is null or v_partido.orden < 0 then raise exception 'Orden de llave inválido'; end if;
  if v_partido.fase = 'final' and v_partido.orden <> 0 then raise exception 'Orden de final inválido'; end if;
  if v_partido.ganador is null then raise exception 'El partido no tiene resultado'; end if;
  if p_nuevo_ganador_id is distinct from v_partido.jugador_a and p_nuevo_ganador_id is distinct from v_partido.jugador_b then
    raise exception 'El ganador debe pertenecer al partido';
  end if;
  if p_nuevo_ganador_id = v_partido.ganador then return jsonb_build_object('success', true); end if;

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
    select * into v_siguiente from public.torneo_partidos
    where torneo_id = v_partido.torneo_id and fase = v_fase_siguiente and orden = v_orden_siguiente
    for update;
    if not found then raise exception 'No existe la llave siguiente'; end if;
    if v_siguiente.ganador is not null then raise exception 'Corrige primero la siguiente fase'; end if;
    if (v_es_slot_a and v_siguiente.jugador_a is distinct from v_partido.ganador)
       or (not v_es_slot_a and v_siguiente.jugador_b is distinct from v_partido.ganador) then
      raise exception 'La llave siguiente no contiene al ganador anterior';
    end if;
    update public.torneo_partidos
    set jugador_a = case when v_es_slot_a then p_nuevo_ganador_id else jugador_a end,
        jugador_b = case when not v_es_slot_a then p_nuevo_ganador_id else jugador_b end
    where id = v_siguiente.id;
  end if;
  update public.torneo_partidos set ganador = p_nuevo_ganador_id where id = p_partido_id;
  return jsonb_build_object('success', true);
end;
$$;

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
  v_jugador_a uuid; v_jugador_b uuid;
  v_grupo_a uuid; v_grupo_b uuid;
  v_pos_a smallint; v_pos_b smallint;
  v_otro_grupo_a uuid; v_otro_grupo_b uuid;
  v_otra_pos_a smallint; v_otra_pos_b smallint;
  v_fase_inicial text;
begin
  if p_partido_a_id = p_partido_b_id and p_posicion_a = p_posicion_b then
    return jsonb_build_object('success', true);
  end if;
  if p_posicion_a is null or p_posicion_b is null
     or p_posicion_a not in ('jugador_a','jugador_b')
     or p_posicion_b not in ('jugador_a','jugador_b') then
    raise exception 'Cupo inválido';
  end if;

  perform 1 from public.torneo_partidos
  where id in (p_partido_a_id, p_partido_b_id)
  order by id for update;
  select * into v_a from public.torneo_partidos where id = p_partido_a_id;
  select * into v_b from public.torneo_partidos where id = p_partido_b_id;
  if v_a.id is null or v_b.id is null then raise exception 'No se encontraron ambos cupos'; end if;

  select * into v_torneo from public.torneos where id = p_torneo_id for update;
  if not found
     or auth.uid() is null
     or public.get_my_rol() is distinct from 'admin'
     or v_torneo.club_id is null
     or v_torneo.club_id is distinct from public.get_my_club_id() then
    raise exception 'Acceso denegado';
  end if;
  if v_a.torneo_id is distinct from p_torneo_id or v_b.torneo_id is distinct from p_torneo_id
     or v_a.fase is distinct from v_b.fase or v_a.fase = 'grupos' then
    raise exception 'Los cupos no pertenecen a la misma ronda';
  end if;
  if v_a.ganador is not null or v_b.ganador is not null
     or v_a.jugador_a is null or v_a.jugador_b is null
     or v_b.jugador_a is null or v_b.jugador_b is null then
    raise exception 'La llave ya comenzó o contiene un BYE protegido';
  end if;

  select p.fase into v_fase_inicial
  from public.torneo_partidos p
  where p.torneo_id = p_torneo_id and p.fase <> 'grupos'
  order by case p.fase when 'avance' then 0 when '32vos' then 1 when '16vos' then 2
    when '8vos' then 3 when 'cuartos' then 4 when 'semis' then 5 when 'final' then 6 else 99 end
  limit 1;
  if v_a.fase is distinct from v_fase_inicial then raise exception 'Solo se edita la ronda inicial'; end if;

  v_jugador_a := case when p_posicion_a = 'jugador_a' then v_a.jugador_a else v_a.jugador_b end;
  v_jugador_b := case when p_posicion_b = 'jugador_a' then v_b.jugador_a else v_b.jugador_b end;
  v_grupo_a := case when p_posicion_a = 'jugador_a' then v_a.slot_a_grupo_id else v_a.slot_b_grupo_id end;
  v_grupo_b := case when p_posicion_b = 'jugador_a' then v_b.slot_a_grupo_id else v_b.slot_b_grupo_id end;
  v_pos_a := case when p_posicion_a = 'jugador_a' then v_a.slot_a_posicion else v_a.slot_b_posicion end;
  v_pos_b := case when p_posicion_b = 'jugador_a' then v_b.slot_a_posicion else v_b.slot_b_posicion end;
  v_otro_grupo_a := case when p_posicion_a = 'jugador_a' then v_a.slot_b_grupo_id else v_a.slot_a_grupo_id end;
  v_otro_grupo_b := case when p_posicion_b = 'jugador_a' then v_b.slot_b_grupo_id else v_b.slot_a_grupo_id end;
  v_otra_pos_a := case when p_posicion_a = 'jugador_a' then v_a.slot_b_posicion else v_a.slot_a_posicion end;
  v_otra_pos_b := case when p_posicion_b = 'jugador_a' then v_b.slot_b_posicion else v_b.slot_a_posicion end;

  if v_jugador_a is null or v_jugador_b is null or v_grupo_a is null or v_grupo_b is null
     or v_pos_a is null or v_pos_b is null then raise exception 'Solo se intercambian cupos definidos'; end if;
  if v_pos_a <> v_pos_b then raise exception 'Intercambia primero con primero o segundo con segundo'; end if;
  if v_grupo_b = v_otro_grupo_a or v_pos_b = v_otra_pos_a
     or v_grupo_a = v_otro_grupo_b or v_pos_a = v_otra_pos_b then
    raise exception 'El intercambio no conserva primero contra segundo de otro grupo';
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

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.marcar_ganador_playoff_seguro(uuid, uuid) from public;
revoke all on function public.corregir_resultado_playoff_seguro(uuid, uuid) from public;
revoke all on function public.intercambiar_cupos_bracket_seguro(uuid, uuid, text, uuid, text) from public;
grant execute on function public.marcar_ganador_playoff_seguro(uuid, uuid) to authenticated;
grant execute on function public.corregir_resultado_playoff_seguro(uuid, uuid) to authenticated;
grant execute on function public.intercambiar_cupos_bracket_seguro(uuid, uuid, text, uuid, text) to authenticated;

alter table public.torneos
  drop constraint if exists torneos_cuota_no_negativa_check;
alter table public.torneos
  add constraint torneos_cuota_no_negativa_check
  check (coalesce(cuota_inscripcion, 0) >= 0 and coalesce(precio_entrada, 0) >= 0);

-- La gestión completa de torneos continúa siendo exclusiva del administrador.
drop policy if exists "torneos_profesor_insert" on public.torneos;

create or replace function public.auditar_reordenamiento_bracket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid;
begin
  if new.slot_a_grupo_id is not distinct from old.slot_a_grupo_id
     and new.slot_a_posicion is not distinct from old.slot_a_posicion
     and new.slot_b_grupo_id is not distinct from old.slot_b_grupo_id
     and new.slot_b_posicion is not distinct from old.slot_b_posicion then
    return new;
  end if;

  select club_id into v_club_id from public.torneos where id = new.torneo_id;
  insert into public.audit_log (
    club_id, entity_type, entity_id, action, before, after, user_id
  ) values (
    v_club_id, 'torneo_partidos', new.id, 'reordenar_bracket',
    jsonb_build_object(
      'jugador_a', old.jugador_a, 'jugador_b', old.jugador_b,
      'slot_a_grupo_id', old.slot_a_grupo_id, 'slot_a_posicion', old.slot_a_posicion,
      'slot_b_grupo_id', old.slot_b_grupo_id, 'slot_b_posicion', old.slot_b_posicion
    ),
    jsonb_build_object(
      'jugador_a', new.jugador_a, 'jugador_b', new.jugador_b,
      'slot_a_grupo_id', new.slot_a_grupo_id, 'slot_a_posicion', new.slot_a_posicion,
      'slot_b_grupo_id', new.slot_b_grupo_id, 'slot_b_posicion', new.slot_b_posicion
    ),
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.auditar_reordenamiento_bracket() from public, anon, authenticated;

drop trigger if exists trg_auditar_reordenamiento_bracket on public.torneo_partidos;
create trigger trg_auditar_reordenamiento_bracket
  after update of jugador_a, jugador_b, slot_a_grupo_id, slot_a_posicion, slot_b_grupo_id, slot_b_posicion
  on public.torneo_partidos
  for each row execute function public.auditar_reordenamiento_bracket();
