-- Los dos RPC del cuadro se quedaron atrás de las fases que el código ya genera.
--
-- Este cambio afecta a: TODOS los clubes. Reescribe dos funciones; no toca
-- ninguna fila.
--
-- ══ 1. `corregir_resultado_playoff_seguro` no acepta el consuelo ═══════════
-- La 254 la escribió con la lista de fases de entonces:
--
--     avance · 32vos · 16vos · 8vos · cuartos · semis · tercer_lugar · final
--
-- Después la 265 agregó las fases del cuadro de consuelo (`cons_*`) y la 267
-- las de los cuadros grandes (`128vos`, `64vos`) al CHECK de `torneo_partidos`,
-- y ninguna de las dos volvió a mirar esta función. Resultado (auditoría del
-- 2026-09-11): el lápiz "Corregir resultado" de la pestaña "Bracket de
-- consuelo" responde SIEMPRE "Fase de playoff inválida". Marcar sí funciona
-- —eso lo hace la Action, que entiende `cons_*`—; corregir, nunca.
--
-- Se amplía la lista y el mapa de "fase siguiente", espejo de
-- `siguienteFaseDeCualquierCuadro()` (src/lib/domain/torneoConsolacion.ts):
-- `cons_8vos` → `cons_cuartos`, y `cons_final` no sigue a ningún lado. El
-- 3er lugar solo cuelga de las semis del cuadro PRINCIPAL: corregir una
-- `cons_semis` no lo toca.
--
-- ══ 2. `intercambiar_cupos_bracket_seguro` deja una llave sin lado A ═══════
-- Un BYE vive siempre en `jugador_a` (así los arma el código y así los lee
-- `marcar_ganador`). Arrastrar al jugador_a de una llave real al cupo vacío
-- del BYE de otra dejaba la llave de origen como (NULL, Y): no es BYE, no
-- avanza sola y la Action se niega a marcarla ("los BYE avanzan solos"). Al
-- terminar el intercambio, el que queda solo pasa al lado A.
--
-- Y su lista para encontrar la ronda inicial tampoco conocía `128vos` ni
-- `64vos`. Hoy es inalcanzable (el arrastre solo existe en el torneo
-- tradicional, que clasifica a lo sumo 64), pero la lista queda completa.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('269_rpc_del_cuadro_con_consuelo_y_cuadros_grandes');
SELECT _migracion_para_todos_los_clubes(
  'reescribe dos funciones del cuadro para las fases de consuelo y de cuadros grandes; no toca ninguna fila');

-- ══ 1. corregir_resultado_playoff_seguro ═══════════════════════════════════
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
  if v_partido.fase is null or v_partido.fase not in (
       'avance', '128vos', '64vos', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'tercer_lugar', 'final',
       'cons_avance', 'cons_128vos', 'cons_64vos', 'cons_32vos', 'cons_16vos', 'cons_8vos',
       'cons_cuartos', 'cons_semis', 'cons_final') then
    raise exception 'Fase de playoff inválida';
  end if;
  if v_partido.orden is null or v_partido.orden < 0 then raise exception 'Orden de llave inválido'; end if;
  if v_partido.fase in ('final', 'cons_final') and v_partido.orden <> 0 then raise exception 'Orden de final inválido'; end if;
  if v_partido.fase = 'tercer_lugar' and v_partido.orden <> 0 then raise exception 'Orden del 3er lugar inválido'; end if;
  if v_partido.ganador is null then raise exception 'El partido no tiene resultado'; end if;
  if p_nuevo_ganador_id is distinct from v_partido.jugador_a and p_nuevo_ganador_id is distinct from v_partido.jugador_b then
    raise exception 'El ganador debe pertenecer al partido';
  end if;
  if p_nuevo_ganador_id = v_partido.ganador then return jsonb_build_object('success', true); end if;

  -- Corregir una semi del cuadro principal cambia quién perdió, y por lo tanto
  -- quién debía jugar el 3er lugar. Si ese partido ya se jugó, su resultado
  -- sería entre dos personas que la llave corregida nunca habría enfrentado:
  -- se corrige ese primero. (Las semis del consuelo no tienen 3er lugar.)
  if v_partido.fase = 'semis' then
    select * into v_tercer from public.torneo_partidos
    where torneo_id = v_partido.torneo_id and fase = 'tercer_lugar' and orden = 0;
    if found and v_tercer.ganador is not null then
      raise exception 'El partido por el 3er lugar ya se jugó. Corrige ese resultado primero.';
    end if;
    if found then
      update public.torneo_partidos
      set jugador_a = null, jugador_b = null
      where id = v_tercer.id and ganador is null;
    end if;
  end if;

  -- El 3er lugar no continúa en ningún lado: corregirlo es solo cambiar su ganador.
  if v_partido.fase = 'tercer_lugar' then
    update public.torneo_partidos set ganador = p_nuevo_ganador_id where id = p_partido_id;
    return jsonb_build_object('success', true);
  end if;

  -- Espejo de `siguienteFaseDeCualquierCuadro()`: el consuelo avanza por sus
  -- propias fases, y su final —como la del principal— no sigue a ningún lado.
  v_fase_siguiente := case v_partido.fase
    when 'avance' then '128vos'
    when '128vos' then '64vos'
    when '64vos' then '32vos'
    when '32vos' then '16vos'
    when '16vos' then '8vos'
    when '8vos' then 'cuartos'
    when 'cuartos' then 'semis'
    when 'semis' then 'final'
    when 'cons_avance' then 'cons_128vos'
    when 'cons_128vos' then 'cons_64vos'
    when 'cons_64vos' then 'cons_32vos'
    when 'cons_32vos' then 'cons_16vos'
    when 'cons_16vos' then 'cons_8vos'
    when 'cons_8vos' then 'cons_cuartos'
    when 'cons_cuartos' then 'cons_semis'
    when 'cons_semis' then 'cons_final'
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

revoke all on function public.corregir_resultado_playoff_seguro(uuid, uuid) from public, anon, authenticated;
grant execute on function public.corregir_resultado_playoff_seguro(uuid, uuid) to authenticated;

-- ══ 2. intercambiar_cupos_bracket_seguro ═══════════════════════════════════
-- Misma función que la 155, con dos cambios: la lista de fases para ubicar la
-- ronda inicial conoce los cuadros grandes, y al terminar normaliza el BYE al
-- lado A. Todo lo demás queda igual (admin, ronda inicial, llave no jugada, no
-- dejar llave vacía, un grupo no se enfrenta a sí mismo).
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

  select * into v_a from public.torneo_partidos where id = p_partido_a_id;
  select * into v_b from public.torneo_partidos where id = p_partido_b_id;

  if v_a.id is null or v_b.id is null then
    raise exception 'No se encontraron ambos cupos';
  end if;

  select * into v_torneo from public.torneos where id = p_torneo_id for update;

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
    when '128vos' then 1
    when '64vos' then 2
    when '32vos' then 3
    when '16vos' then 4
    when '8vos' then 5
    when 'cuartos' then 6
    when 'semis' then 7
    when 'final' then 8
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

  v_jugador_a := case when p_posicion_a = 'jugador_a' then v_a.jugador_a else v_a.jugador_b end;
  v_jugador_b := case when p_posicion_b = 'jugador_a' then v_b.jugador_a else v_b.jugador_b end;
  v_grupo_a := case when p_posicion_a = 'jugador_a' then v_a.slot_a_grupo_id else v_a.slot_b_grupo_id end;
  v_grupo_b := case when p_posicion_b = 'jugador_a' then v_b.slot_a_grupo_id else v_b.slot_b_grupo_id end;
  v_pos_a := case when p_posicion_a = 'jugador_a' then v_a.slot_a_posicion else v_a.slot_b_posicion end;
  v_pos_b := case when p_posicion_b = 'jugador_a' then v_b.slot_a_posicion else v_b.slot_b_posicion end;
  v_otro_grupo_a := case when p_posicion_a = 'jugador_a' then v_a.slot_b_grupo_id else v_a.slot_a_grupo_id end;
  v_otro_grupo_b := case when p_posicion_b = 'jugador_a' then v_b.slot_b_grupo_id else v_b.slot_a_grupo_id end;

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

  -- Limpiar ganador antes de mover para no violar ganador_participante_check
  update public.torneo_partidos
  set ganador = null
  where id in (v_a.id, v_b.id) and ganador is not null;

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

  -- El BYE vive en el lado A: si una llave quedó con el lado A vacío y alguien
  -- en el B, ese alguien pasa al A con su cupo. Sin esto la llave quedaba como
  -- (NULL, Y): ni BYE ni partido, y nadie podía avanzarla.
  update public.torneo_partidos set
    jugador_a = jugador_b,
    slot_a_grupo_id = slot_b_grupo_id,
    slot_a_posicion = slot_b_posicion,
    jugador_b = null,
    slot_b_grupo_id = null,
    slot_b_posicion = null
  where id in (v_a.id, v_b.id)
    and jugador_a is null
    and jugador_b is not null;

  -- Recalcula el BYE: si tras el intercambio una llave se quedó sin rival,
  -- el que queda avanza solo; si ahora tiene rival, vuelve a quedar pendiente.
  update public.torneo_partidos
  set ganador = case when jugador_b is null then jugador_a else null end
  where id in (v_a.id, v_b.id);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.intercambiar_cupos_bracket_seguro(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.intercambiar_cupos_bracket_seguro(uuid, uuid, text, uuid, text) to authenticated;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- Las dos funciones existen y son SECURITY DEFINER.
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('corregir_resultado_playoff_seguro', 'intercambiar_cupos_bracket_seguro');

-- La lista de fases nueva quedó dentro del cuerpo de la función.
SELECT position('cons_8vos' in pg_get_functiondef('public.corregir_resultado_playoff_seguro(uuid, uuid)'::regprocedure)) > 0
  AS conoce_el_consuelo;
