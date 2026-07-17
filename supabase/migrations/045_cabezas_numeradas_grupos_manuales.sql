-- Cabezas de serie numeradas y grupos creados manualmente.

alter table public.torneo_grupos
  add column if not exists en_preparacion boolean not null default false;

create unique index if not exists torneo_grupos_unico_en_preparacion_idx
  on public.torneo_grupos (torneo_id)
  where en_preparacion;

-- La migración se detiene si los dos campos legacy contienen datos que no
-- pueden convertirse sin cambiar silenciosamente su significado.
do $$
begin
  if exists (
    select 1
    from public.torneos
    where cabeza_serie_1 is not null
      and cabeza_serie_1 = cabeza_serie_2
  ) then
    raise exception 'Hay torneos con el mismo jugador como cabeza 1 y 2';
  end if;

  if exists (
    select 1
    from public.torneos
    where cabeza_serie_1 is null and cabeza_serie_2 is not null
  ) then
    raise exception 'Hay torneos con cabeza 2 pero sin cabeza 1';
  end if;

  if exists (
    select 1
    from public.torneos
    where club_id is null
      and (cabeza_serie_1 is not null or cabeza_serie_2 is not null)
  ) then
    raise exception 'Hay torneos con cabezas de serie pero sin club';
  end if;

  if exists (
    select 1
    from public.torneos t
    cross join lateral (
      values (t.cabeza_serie_1), (t.cabeza_serie_2)
    ) as cabeza(jugador_id)
    join public.jugadores j on j.id = cabeza.jugador_id
    where cabeza.jugador_id is not null
      and j.club_id is distinct from t.club_id
  ) then
    raise exception 'Hay cabezas de serie que pertenecen a otro club';
  end if;

  if exists (
    select 1
    from public.torneos t
    cross join lateral (
      values (t.cabeza_serie_1), (t.cabeza_serie_2)
    ) as cabeza(jugador_id)
    where cabeza.jugador_id is not null
      and not exists (
        select 1
        from public.grupo_jugadores gj
        join public.torneo_grupos tg on tg.id = gj.grupo_id
        where tg.torneo_id = t.id
          and gj.jugador_id = cabeza.jugador_id
      )
  ) then
    raise exception 'Hay cabezas de serie que no están inscritas en su torneo';
  end if;

  if exists (
    select 1
    from public.torneos t
    join public.grupo_jugadores a on a.jugador_id = t.cabeza_serie_1
    join public.grupo_jugadores b on b.jugador_id = t.cabeza_serie_2
      and b.grupo_id = a.grupo_id
    join public.torneo_grupos tg on tg.id = a.grupo_id
    where tg.torneo_id = t.id
      and tg.nombre is distinct from 'MESA'
      and t.cabeza_serie_1 is not null
      and t.cabeza_serie_2 is not null
  ) then
    raise exception 'Hay cabezas de serie legacy en el mismo grupo';
  end if;
end
$$;

alter table public.torneos
  drop constraint if exists torneos_cabezas_serie_distintas_check;
alter table public.torneos
  add constraint torneos_cabezas_serie_distintas_check
  check (
    cabeza_serie_1 is null
    or cabeza_serie_2 is null
    or cabeza_serie_1 <> cabeza_serie_2
  );

create table public.torneo_cabezas_serie (
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  numero integer not null check (numero between 1 and 32),
  creado_en timestamptz not null default now(),
  primary key (torneo_id, jugador_id),
  constraint torneo_cabezas_serie_numero_unico unique (torneo_id, numero)
);

create index torneo_cabezas_serie_jugador_idx
  on public.torneo_cabezas_serie (jugador_id);

alter table public.torneo_cabezas_serie enable row level security;

drop policy if exists "torneo_cabezas_serie_select" on public.torneo_cabezas_serie;
create policy "torneo_cabezas_serie_select" on public.torneo_cabezas_serie
  for select to authenticated
  using (
    exists (
      select 1
      from public.torneos t
      where t.id = torneo_id
        and t.club_id = public.get_my_club_id()
    )
  );

revoke all on table public.torneo_cabezas_serie from public, anon, authenticated;
grant select on table public.torneo_cabezas_serie to authenticated;

-- Conserva la prioridad existente sin borrar todavía las columnas legacy.
insert into public.torneo_cabezas_serie (torneo_id, jugador_id, numero)
select t.id, cabeza.jugador_id, cabeza.numero
from public.torneos t
cross join lateral (
  values (t.cabeza_serie_1, 1), (t.cabeza_serie_2, 2)
) as cabeza(jugador_id, numero)
where cabeza.jugador_id is not null;

-- Mientras una versión anterior siga desplegada, cualquier cambio efectuado
-- sobre cabeza_serie_1/2 se refleja en la tabla normalizada.
create or replace function public.sincronizar_cabezas_serie_legacy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tabla_1 uuid;
  v_tabla_2 uuid;
  v_antes jsonb;
  v_despues jsonb;
begin
  if new.cabeza_serie_1 is not distinct from old.cabeza_serie_1
     and new.cabeza_serie_2 is not distinct from old.cabeza_serie_2 then
    return new;
  end if;

  select
    (
      select c.jugador_id
      from public.torneo_cabezas_serie c
      where c.torneo_id = new.id and c.numero = 1
    ),
    (
      select c.jugador_id
      from public.torneo_cabezas_serie c
      where c.torneo_id = new.id and c.numero = 2
    )
  into v_tabla_1, v_tabla_2
  ;

  -- La RPC nueva escribe primero la tabla y después las columnas legacy.
  -- Si ya coinciden, no hay que repetir el cambio ni duplicar la auditoría.
  if v_tabla_1 is not distinct from new.cabeza_serie_1
     and v_tabla_2 is not distinct from new.cabeza_serie_2 then
    return new;
  end if;

  if new.club_id is null then
    raise exception 'El torneo no tiene club';
  end if;
  if new.cabeza_serie_1 is not null
     and new.cabeza_serie_1 = new.cabeza_serie_2 then
    raise exception 'Los cabezas de serie deben ser distintos';
  end if;
  if new.cabeza_serie_1 is null and new.cabeza_serie_2 is not null then
    raise exception 'No puede existir cabeza 2 sin cabeza 1';
  end if;
  if exists (
    select 1
    from unnest(array_remove(
      array[new.cabeza_serie_1, new.cabeza_serie_2]::uuid[], null
    )) as cabeza(jugador_id)
    left join public.jugadores j on j.id = cabeza.jugador_id
    where j.id is null
       or j.club_id is distinct from new.club_id
       or not exists (
         select 1
         from public.grupo_jugadores gj
         join public.torneo_grupos tg on tg.id = gj.grupo_id
         where tg.torneo_id = new.id
           and gj.jugador_id = cabeza.jugador_id
       )
  ) then
    raise exception 'Todos los cabezas deben estar inscritos y pertenecer al club';
  end if;
  if new.cabeza_serie_1 is not null and new.cabeza_serie_2 is not null and exists (
    select 1
    from public.grupo_jugadores a
    join public.grupo_jugadores b on b.grupo_id = a.grupo_id
    join public.torneo_grupos tg on tg.id = a.grupo_id
    where tg.torneo_id = new.id
      and tg.nombre is distinct from 'MESA'
      and a.jugador_id = new.cabeza_serie_1
      and b.jugador_id = new.cabeza_serie_2
  ) then
    raise exception 'No pueden quedar dos cabezas de serie en el mismo grupo';
  end if;
  if exists (
    select 1
    from public.torneo_partidos p
    where p.torneo_id = new.id
      and p.fase is distinct from 'grupos'
  ) then
    raise exception 'No se pueden cambiar los cabezas después de crear el bracket';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('numero', numero, 'jugador_id', jugador_id)
      order by numero
    ),
    '[]'::jsonb
  )
  into v_antes
  from public.torneo_cabezas_serie
  where torneo_id = new.id;

  delete from public.torneo_cabezas_serie
  where torneo_id = new.id
    and (
      numero in (1, 2)
      or jugador_id = any(array_remove(
        array[new.cabeza_serie_1, new.cabeza_serie_2]::uuid[], null
      ))
    );

  insert into public.torneo_cabezas_serie (torneo_id, jugador_id, numero)
  select new.id, cabeza.jugador_id, cabeza.numero
  from (
    values (new.cabeza_serie_1, 1), (new.cabeza_serie_2, 2)
  ) as cabeza(jugador_id, numero)
  where cabeza.jugador_id is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('numero', numero, 'jugador_id', jugador_id)
      order by numero
    ),
    '[]'::jsonb
  )
  into v_despues
  from public.torneo_cabezas_serie
  where torneo_id = new.id;

  insert into public.audit_log (
    club_id, entity_type, entity_id, action, before, after, user_id
  ) values (
    new.club_id, 'torneos', new.id, 'configurar_cabezas_serie_legacy',
    v_antes, v_despues, auth.uid()
  );

  return new;
end;
$$;

revoke all on function public.sincronizar_cabezas_serie_legacy()
  from public, anon, authenticated;

drop trigger if exists trg_sincronizar_cabezas_serie_legacy on public.torneos;
create trigger trg_sincronizar_cabezas_serie_legacy
  after update of cabeza_serie_1, cabeza_serie_2
  on public.torneos
  for each row execute function public.sincronizar_cabezas_serie_legacy();

-- Reemplaza la lista completa y asigna números densos 1..N en una sola
-- transacción. Es la única vía de escritura expuesta al cliente.
create or replace function public.configurar_cabezas_serie(
  p_torneo_id uuid,
  p_jugador_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_torneo public.torneos%rowtype;
  v_actual uuid[];
  v_antes jsonb;
  v_despues jsonb;
  v_distintos integer;
  v_grupos integer;
  v_inscritos integer;
begin
  select *
  into v_torneo
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

  if p_jugador_ids is null then
    raise exception 'La lista de cabezas es obligatoria';
  end if;
  if cardinality(p_jugador_ids) > 32 then
    raise exception 'El máximo es 32 cabezas de serie';
  end if;
  if array_position(p_jugador_ids, null) is not null then
    raise exception 'La lista de cabezas contiene valores vacíos';
  end if;

  select count(distinct cabeza.jugador_id)::integer
  into v_distintos
  from unnest(p_jugador_ids) as cabeza(jugador_id);
  if v_distintos <> cardinality(p_jugador_ids) then
    raise exception 'Un jugador no puede ocupar dos números de cabeza';
  end if;

  select count(*)::integer into v_grupos
  from public.torneo_grupos
  where torneo_id = p_torneo_id and nombre is distinct from 'MESA';
  if v_grupos = 0 then
    select count(distinct gj.jugador_id)::integer into v_inscritos
    from public.grupo_jugadores gj
    join public.torneo_grupos tg on tg.id = gj.grupo_id
    where tg.torneo_id = p_torneo_id;
    v_grupos := greatest(2, round(coalesce(v_inscritos, 0) / 3.0)::integer);
  end if;
  if cardinality(p_jugador_ids) > v_grupos then
    raise exception 'Debe existir como máximo una cabeza de serie por grupo';
  end if;

  select coalesce(array_agg(jugador_id order by numero), '{}'::uuid[])
  into v_actual
  from public.torneo_cabezas_serie
  where torneo_id = p_torneo_id;

  if v_actual = p_jugador_ids then
    return jsonb_build_object(
      'success', true,
      'cantidad', cardinality(p_jugador_ids)
    );
  end if;

  if exists (
    select 1
    from public.torneo_partidos p
    where p.torneo_id = p_torneo_id
      and p.fase is distinct from 'grupos'
  ) then
    raise exception 'No se pueden cambiar los cabezas después de crear el bracket';
  end if;

  if exists (
    select 1
    from unnest(p_jugador_ids) as cabeza(jugador_id)
    left join public.jugadores j on j.id = cabeza.jugador_id
    where j.id is null
       or j.club_id is distinct from v_torneo.club_id
       or not exists (
         select 1
         from public.grupo_jugadores gj
         join public.torneo_grupos tg on tg.id = gj.grupo_id
         where tg.torneo_id = p_torneo_id
           and gj.jugador_id = cabeza.jugador_id
       )
  ) then
    raise exception 'Todos los cabezas deben estar inscritos y pertenecer al club';
  end if;

  if exists (
    select 1
    from public.grupo_jugadores gj
    join public.torneo_grupos tg on tg.id = gj.grupo_id
    where tg.torneo_id = p_torneo_id
      and tg.nombre is distinct from 'MESA'
      and gj.jugador_id = any(p_jugador_ids)
    group by gj.grupo_id
    having count(*) > 1
  ) then
    raise exception 'No pueden quedar dos cabezas de serie en el mismo grupo';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('numero', numero, 'jugador_id', jugador_id)
      order by numero
    ),
    '[]'::jsonb
  )
  into v_antes
  from public.torneo_cabezas_serie
  where torneo_id = p_torneo_id;

  delete from public.torneo_cabezas_serie
  where torneo_id = p_torneo_id;

  insert into public.torneo_cabezas_serie (torneo_id, jugador_id, numero)
  select p_torneo_id, cabeza.jugador_id, cabeza.numero::integer
  from unnest(p_jugador_ids) with ordinality
    as cabeza(jugador_id, numero);

  select coalesce(
    jsonb_agg(
      jsonb_build_object('numero', numero, 'jugador_id', jugador_id)
      order by numero
    ),
    '[]'::jsonb
  )
  into v_despues
  from public.torneo_cabezas_serie
  where torneo_id = p_torneo_id;

  -- Dual-write temporal para que un despliegue anterior siga leyendo #1 y #2.
  update public.torneos
  set cabeza_serie_1 = p_jugador_ids[1],
      cabeza_serie_2 = p_jugador_ids[2]
  where id = p_torneo_id;

  insert into public.audit_log (
    club_id, entity_type, entity_id, action, before, after, user_id
  ) values (
    v_torneo.club_id, 'torneos', p_torneo_id, 'configurar_cabezas_serie',
    v_antes, v_despues, auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'cantidad', cardinality(p_jugador_ids)
  );
end;
$$;

revoke all on function public.configurar_cabezas_serie(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.configurar_cabezas_serie(uuid, uuid[])
  to authenticated;

-- 044 permite ajustar cupos compatibles antes de jugar la ronda inicial.
-- Con cabezas numeradas, ningún cabeza puede moverse y ningún intercambio
-- puede cruzar el límite entre ambas mitades del árbol.
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
  v_otra_pos_a smallint;
  v_otra_pos_b smallint;
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
  if v_a.ganador is not null or v_b.ganador is not null
     or v_a.jugador_a is null or v_a.jugador_b is null
     or v_b.jugador_a is null or v_b.jugador_b is null then
    raise exception 'La llave ya comenzó o contiene un BYE protegido';
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
  v_otra_pos_a := case
    when p_posicion_a = 'jugador_a' then v_a.slot_b_posicion
    else v_a.slot_a_posicion
  end;
  v_otra_pos_b := case
    when p_posicion_b = 'jugador_a' then v_b.slot_b_posicion
    else v_b.slot_a_posicion
  end;

  if v_jugador_a is null or v_jugador_b is null
     or v_grupo_a is null or v_grupo_b is null
     or v_pos_a is null or v_pos_b is null then
    raise exception 'Solo se intercambian cupos definidos';
  end if;
  if exists (
    select 1
    from public.torneo_cabezas_serie c
    where c.torneo_id = p_torneo_id
      and c.jugador_id in (v_jugador_a, v_jugador_b)
  ) then
    raise exception 'Los cabezas de serie no se pueden mover en el bracket';
  end if;
  if v_pos_a <> v_pos_b then
    raise exception 'Intercambia primero con primero o segundo con segundo';
  end if;
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

revoke all on function public.intercambiar_cupos_bracket_seguro(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.intercambiar_cupos_bracket_seguro(
  uuid, uuid, text, uuid, text
) to authenticated;
