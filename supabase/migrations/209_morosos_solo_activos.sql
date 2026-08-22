-- ────────────────────────────────────────────────────────────
-- dashboard_kpis: la morosidad deja de contar a los jugadores bloqueados.
--
-- v_morosos se calculaba leyendo `mensualidades` directo por mes/año/estado,
-- sin mirar si el jugador seguía activo. Bloquear a alguien no cierra ni
-- borra su cuota pendiente del mes: la fila queda en `mensualidades` con
-- estado 'pendiente' o 'atrasado', y el conteo la seguía sumando. La lista
-- de morosos (`morosos_lista`) tenía el mismo problema: el JOIN con
-- `jugadores` no filtraba `estado = 'activo'`, así que el nombre del
-- jugador bloqueado seguía apareciendo en la lista de deudores del
-- dashboard.
--
-- El resultado: la tasa de morosidad se inflaba (el denominador v_activos
-- sí baja al bloquear a alguien; el numerador v_morosos no bajaba), y un
-- jugador ya bloqueado seguía figurando como si hubiera que cobrarle.
--
-- El arreglo es el mismo criterio que ya usa v_activos: `estado = 'activo'`
-- y `es_externo` no verdadero. Se aplica a v_morosos, v_morosos_anterior y
-- morosos_lista — los tres leían la tabla cruda sin ese filtro.
--
-- No destructivo sobre datos: no se toca ninguna fila, solo la definición
-- de la función. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('209_morosos_solo_activos');

CREATE OR REPLACE FUNCTION dashboard_kpis(p_club_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_mes                  int := extract(month from (now() at time zone 'America/Santiago')::date)::int;
  v_anio                 int := extract(year from (now() at time zone 'America/Santiago')::date)::int;
  v_mes_anterior         int;
  v_anio_anterior        int;
  v_inicio_mes           date;
  v_inicio_mes_anterior  date;
  v_fin_mes_anterior     date;

  v_activos              bigint;
  v_activos_anterior     bigint;
  v_torneos_activos      bigint;
  v_morosos              bigint;
  v_morosos_anterior     bigint;
  v_ingresos             numeric;
  v_ingresos_anterior    numeric;
  v_gastos               numeric;
  v_gastos_anterior      numeric;
  v_solicitudes_pendientes bigint;

  v_morosos_lista        json;
  v_solicitudes_lista    json;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  if v_mes = 1 then
    v_mes_anterior  := 12;
    v_anio_anterior := v_anio - 1;
  else
    v_mes_anterior  := v_mes - 1;
    v_anio_anterior := v_anio;
  end if;

  v_inicio_mes          := make_date(v_anio, v_mes, 1);
  v_inicio_mes_anterior := make_date(v_anio_anterior, v_mes_anterior, 1);
  v_fin_mes_anterior    := v_inicio_mes - interval '1 day';

  select count(*) into v_activos
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false);

  select count(*) into v_activos_anterior
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false)
    and creado_en::date <= v_fin_mes_anterior;

  select count(*) into v_torneos_activos
  from torneos
  where club_id = p_club_id and estado = 'en_curso';

  -- Morosidad: solo cuenta si el jugador SIGUE activo hoy. Bloquear a alguien
  -- no cierra su cuota pendiente en `mensualidades`, así que sin este filtro
  -- se le sigue "cobrando" en el dashboard después de bloqueado.
  select count(*) into v_morosos
  from mensualidades men
  join jugadores j on j.id = men.jugador_id
  where men.club_id = p_club_id and men.mes = v_mes and men.anio = v_anio
    and (men.estado = 'pendiente' or men.estado = 'atrasado')
    and j.estado = 'activo' and (j.es_externo is null or j.es_externo = false);

  select count(*) into v_morosos_anterior
  from mensualidades men
  join jugadores j on j.id = men.jugador_id
  where men.club_id = p_club_id and men.mes = v_mes_anterior and men.anio = v_anio_anterior
    and (men.estado = 'pendiente' or men.estado = 'atrasado')
    and j.estado = 'activo' and (j.es_externo is null or j.es_externo = false);

  select coalesce(sum(monto), 0) into v_ingresos
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso' and fecha >= v_inicio_mes;

  select coalesce(sum(monto), 0) into v_ingresos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'ingreso'
    and fecha >= v_inicio_mes_anterior and fecha < v_inicio_mes;

  select coalesce(sum(monto), 0) into v_gastos
  from movimientos
  where club_id = p_club_id and tipo = 'gasto' and fecha >= v_inicio_mes;

  select coalesce(sum(monto), 0) into v_gastos_anterior
  from movimientos
  where club_id = p_club_id and tipo = 'gasto'
    and fecha >= v_inicio_mes_anterior and fecha < v_inicio_mes;

  select count(*) into v_solicitudes_pendientes
  from solicitudes_jugador
  where club_id = p_club_id and estado = 'pendiente';

  -- Misma razón que v_morosos: sin filtrar j.estado, un jugador bloqueado
  -- seguía apareciendo con nombre y teléfono en la lista de deudores.
  select json_agg(m) into v_morosos_lista
  from (
    select men.id, men.jugador_id, men.estado, j.nombre, j.telefono
    from mensualidades men
    join jugadores j on j.id = men.jugador_id
    where men.club_id = p_club_id
      and men.mes = v_mes and men.anio = v_anio
      and (men.estado = 'pendiente' or men.estado = 'atrasado')
      and j.estado = 'activo' and (j.es_externo is null or j.es_externo = false)
  ) m;

  select json_agg(s order by s.creado_en desc) into v_solicitudes_lista
  from (
    select id, nombre, rut, email, telefono, creado_en
    from solicitudes_jugador
    where club_id = p_club_id and estado = 'pendiente'
  ) s;

  return json_build_object(
    'jugadores_activos',        v_activos,
    'jugadores_activos_anterior', v_activos_anterior,
    'torneos_activos',          v_torneos_activos,
    'morosos',                  v_morosos,
    'morosos_anterior',         v_morosos_anterior,
    'tasa_morosidad',           case when v_activos > 0 then round((v_morosos::numeric / v_activos) * 100) else 0 end,
    'tasa_morosidad_anterior',  case when v_activos_anterior > 0 then round((v_morosos_anterior::numeric / v_activos_anterior) * 100) else 0 end,
    'ingresos',                 v_ingresos,
    'ingresos_anterior',        v_ingresos_anterior,
    'gastos',                   v_gastos,
    'gastos_anterior',          v_gastos_anterior,
    'coa',                      case when v_activos > 0 then round(v_gastos / v_activos) else 0 end,
    'coa_anterior',             case when v_activos_anterior > 0 then round(v_gastos_anterior / v_activos_anterior) else 0 end,
    'solicitudes_pendientes',   v_solicitudes_pendientes,
    'morosos_lista',            coalesce(v_morosos_lista, '[]'::json),
    'solicitudes_lista',        coalesce(v_solicitudes_lista, '[]'::json),
    'mes',                      v_mes,
    'anio',                     v_anio
  );
end;
$$;

COMMIT;

-- ── Verificación: correr aparte, no como parte del bloque de arriba ────────
-- Comparar antes/después con un jugador bloqueado que tenga mensualidad
-- pendiente del mes: debe desaparecer de morosos_lista y bajar el conteo.
-- SELECT dashboard_kpis('<club_id>'::uuid);
