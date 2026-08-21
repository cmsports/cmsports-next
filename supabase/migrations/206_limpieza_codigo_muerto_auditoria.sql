-- ────────────────────────────────────────────────────────────
-- Limpieza de dos restos que dejó la auditoría de migraciones de hoy.
--
-- Ninguno de los dos es un bug de datos ni de seguridad: son cosas que
-- quedaron vivas sin que nada las use, y por eso vale la pena sacarlas antes
-- de que confundan a alguien auditando esto de nuevo más adelante.
--
-- 1. dashboard_kpis calculaba `ultimas_asistencias` (un JOIN + json_agg en
--    cada carga del dashboard) leyendo `asistencia` sin filtrar
--    `estado = 'presente'`. Se rastreó el frontend entero y ese campo del
--    JSON no lo lee nada: la tarjeta "Últimos registros" que sí se ve en
--    pantalla usa una consulta aparte (src/app/dashboard/page.tsx,
--    cargarAsistenciaHoy) que ya filtra bien. Se saca el cálculo completo.
--
-- 2. registrar_asistencia_rut(uuid, text) —la versión de 2 argumentos, sin
--    token— quedó con REVOKE ALL FROM PUBLIC, anon, authenticated desde la
--    042, cuando se reemplazó por la versión de 3 argumentos con token de
--    kiosco. Nadie la puede ejecutar hoy, pero el objeto función seguía
--    vivo en la base. Se elimina entera para que no quede ahí esperando
--    que alguna migración futura le re-otorgue permisos por accidente.
--
-- No destructivo sobre datos: no se toca ninguna fila, solo definiciones de
-- funciones. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('206_limpieza_codigo_muerto_auditoria');

-- ══ 1. dashboard_kpis sin el cálculo muerto de últimas asistencias ══════════
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

  select count(*) into v_morosos
  from mensualidades
  where club_id = p_club_id and mes = v_mes and anio = v_anio
    and (estado = 'pendiente' or estado = 'atrasado');

  select count(*) into v_morosos_anterior
  from mensualidades
  where club_id = p_club_id and mes = v_mes_anterior and anio = v_anio_anterior
    and (estado = 'pendiente' or estado = 'atrasado');

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

  select json_agg(m) into v_morosos_lista
  from (
    select men.id, men.jugador_id, men.estado, j.nombre, j.telefono
    from mensualidades men
    join jugadores j on j.id = men.jugador_id
    where men.club_id = p_club_id
      and men.mes = v_mes and men.anio = v_anio
      and (men.estado = 'pendiente' or men.estado = 'atrasado')
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

-- ══ 2. Sacar la sobrecarga muerta de registrar_asistencia_rut ══════════════
DROP FUNCTION IF EXISTS public.registrar_asistencia_rut(uuid, text);

COMMIT;
