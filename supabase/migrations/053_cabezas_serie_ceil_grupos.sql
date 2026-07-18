-- Sincroniza la estimación de grupos en configurar_cabezas_serie con
-- calcularNumGrupos en TypeScript: ceil en vez de round, para que
-- nunca se armen grupos de 4 automáticamente (máximo 3 por grupo).
-- Sin esto, 13 jugadores estimaba 4 grupos (round(4.33)) pero el TS
-- creaba 5 (ceil(4.33)), y guardar 5 cabezas fallaba con
-- "Debe existir como máximo una cabeza de serie por grupo".
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
    v_grupos := greatest(2, ceil(coalesce(v_inscritos, 0) / 3.0)::integer);
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
      and p.ganador is not null
      and p.jugador_b is not null
  ) then
    raise exception 'No se pueden cambiar los cabezas después de jugar partidos del bracket';
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
