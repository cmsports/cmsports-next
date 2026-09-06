-- Torneo INTERNO: el 3er lugar se disputa dentro de la llave.
--
-- Los dos que pierden las semifinales juegan una mini llave por el 3er y 4°
-- puesto, colgada de la final. El partido vive en `torneo_partidos` con
-- `fase = 'tercer_lugar'` y `orden = 0`: no es un peldaño del árbol, así que no
-- propaga a ninguna fase siguiente ni mueve la fase del torneo.
--
-- Los dos RPC de la migración 044 rechazaban esa fase con "Fase de playoff
-- inválida", así que acá se agregan a su lista blanca. `corregir_resultado_
-- playoff_seguro` además se niega a corregir una semi cuando el 3er lugar ya se
-- jugó, igual que hace el módulo oficial: cambiar al perdedor de la semi
-- dejaría un resultado del 3er lugar entre dos jugadores que ya no le tocaban.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('254_tercer_lugar_torneo_interno');
SELECT _migracion_para_todos_los_clubes('agrega una columna y reemplaza dos funciones; no toca ninguna fila');

-- ── El podio guarda también al tercero ──────────────────────────────────────
ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS tercer_id uuid;

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_tercer_id_fkey;

ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_tercer_id_fkey
  FOREIGN KEY (tercer_id) REFERENCES public.jugadores(id) ON DELETE SET NULL;

-- ── Marcar el ganador de un partido de llave ────────────────────────────────
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
  if v_partido.fase is null or v_partido.fase not in ('avance','32vos','16vos','8vos','cuartos','semis','tercer_lugar','final') then
    raise exception 'Fase de playoff inválida';
  end if;
  if v_partido.orden is null or v_partido.orden < 0 then raise exception 'Orden de llave inválido'; end if;
  if v_partido.fase = 'final' and v_partido.orden <> 0 then raise exception 'Orden de final inválido'; end if;
  if v_partido.fase = 'tercer_lugar' and v_partido.orden <> 0 then raise exception 'Orden del 3er lugar inválido'; end if;
  if v_partido.ganador is not null then raise exception 'El partido ya tiene ganador'; end if;
  if v_partido.jugador_a is null or v_partido.jugador_b is null then raise exception 'Los BYE avanzan automáticamente'; end if;
  if p_ganador_id is distinct from v_partido.jugador_a and p_ganador_id is distinct from v_partido.jugador_b then
    raise exception 'El ganador debe pertenecer al partido';
  end if;

  -- El cuadro puede convivir con grupos aún abiertos. Una rama completa puede
  -- jugarse antes sin cambiar prematuramente la fase global del torneo.
  update public.torneo_partidos set ganador = p_ganador_id where id = p_partido_id;

  -- El 3er lugar cuelga de la llave pero no la continúa: no tiene fase
  -- siguiente a la que mandar al ganador, y tampoco mueve la fase del torneo
  -- (esa la manda la final).
  if v_partido.fase = 'tercer_lugar' then
    return jsonb_build_object('success', true);
  end if;

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

-- ── Corregir un resultado ya cargado ────────────────────────────────────────
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
  v_tercer public.torneo_partidos%rowtype;
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
  if v_partido.fase is null or v_partido.fase not in ('avance','32vos','16vos','8vos','cuartos','semis','tercer_lugar','final') then
    raise exception 'Fase de playoff inválida';
  end if;
  if v_partido.orden is null or v_partido.orden < 0 then raise exception 'Orden de llave inválido'; end if;
  if v_partido.fase = 'final' and v_partido.orden <> 0 then raise exception 'Orden de final inválido'; end if;
  if v_partido.fase = 'tercer_lugar' and v_partido.orden <> 0 then raise exception 'Orden del 3er lugar inválido'; end if;
  if v_partido.ganador is null then raise exception 'El partido no tiene resultado'; end if;
  if p_nuevo_ganador_id is distinct from v_partido.jugador_a and p_nuevo_ganador_id is distinct from v_partido.jugador_b then
    raise exception 'El ganador debe pertenecer al partido';
  end if;
  if p_nuevo_ganador_id = v_partido.ganador then return jsonb_build_object('success', true); end if;

  -- Corregir una semi cambia quién perdió, y por lo tanto quién debía jugar el
  -- 3er lugar. Si ese partido ya se jugó, su resultado sería entre dos personas
  -- que la llave corregida nunca habría enfrentado: se corrige ese primero.
  if v_partido.fase = 'semis' then
    -- `orden = 0` no es decorativo: sin él, un SELECT INTO que encuentre dos
    -- filas revienta la corrección entera.
    select * into v_tercer from public.torneo_partidos
    where torneo_id = v_partido.torneo_id and fase = 'tercer_lugar' and orden = 0;
    if found and v_tercer.ganador is not null then
      raise exception 'El partido por el 3er lugar ya se jugó. Corrige ese resultado primero.';
    end if;
    if found then
      -- Todavía sin jugar: se reabre para que la app lo vuelva a sembrar con
      -- los perdedores correctos.
      update public.torneo_partidos
      set jugador_a = null, jugador_b = null
      where id = v_tercer.id and ganador is null;
    end if;
  end if;

  -- El 3er lugar no continúa en ningún lado: corregirlo es solo cambiar su
  -- ganador.
  if v_partido.fase = 'tercer_lugar' then
    update public.torneo_partidos set ganador = p_nuevo_ganador_id where id = p_partido_id;
    return jsonb_build_object('success', true);
  end if;

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

COMMIT;
