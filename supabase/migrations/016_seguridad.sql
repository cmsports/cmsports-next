-- ============================================================
-- CmSports — Endurecimiento de seguridad (Revisión 2026-07-01)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--   3. Se puede correr de nuevo sin riesgo (idempotente)
--
-- Qué corrige:
--   1. Escalación de privilegios: cualquier usuario podía cambiar
--      su propio rol/club/jugador_id vía UPDATE a perfiles.
--   2. dashboard_kpis y generar_mensualidades eran SECURITY DEFINER
--      sin chequeo: cualquier usuario autenticado podía ver finanzas
--      de cualquier club o generar mensualidades ajenas.
--   3. invitaciones era legible por cualquiera (incluso sin sesión):
--      se podían enumerar todos los códigos de invitación.
--   4. Un jugador podía marcar su propia mensualidad como 'pagado'.
--   5. reservas no estaba aislada por club (admin/profesor de un
--      club veía y editaba reservas de otro club).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. PERFILES — trigger que protege rol / club_id / jugador_id
--    · Llamadas sin JWT (service role, SQL editor, pg_cron) pasan.
--    · Un usuario normal no puede tocar esas 3 columnas.
--    · Solo un superadmin puede otorgar el rol 'superadmin'.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proteger_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
BEGIN
  -- Sin JWT de usuario = service role / SQL directo / cron → sin restricción
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_rol := get_my_rol();

  IF TG_OP = 'UPDATE' AND (
       NEW.rol        IS DISTINCT FROM OLD.rol
    OR NEW.club_id    IS DISTINCT FROM OLD.club_id
    OR NEW.jugador_id IS DISTINCT FROM OLD.jugador_id
  ) AND (v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin')) THEN
    RAISE EXCEPTION 'No autorizado a modificar rol, club o jugador del perfil';
  END IF;

  IF NEW.rol = 'superadmin'
     AND (TG_OP = 'INSERT' OR OLD.rol IS DISTINCT FROM 'superadmin')
     AND v_rol IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadmin puede otorgar el rol superadmin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_proteger ON perfiles;
CREATE TRIGGER perfiles_proteger
  BEFORE INSERT OR UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION proteger_perfil();


-- ────────────────────────────────────────────────────────────
-- 2a. dashboard_kpis — solo admin de ese club (o superadmin)
--     (mismo cuerpo que 005, con candado de autorización al inicio)
-- ────────────────────────────────────────────────────────────
create or replace function dashboard_kpis(p_club_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_mes                  int := extract(month from current_date)::int;
  v_anio                 int := extract(year from current_date)::int;
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
  v_ultimas_asistencias  json;
begin
  -- Candado: solo el admin del club consultado o un superadmin.
  -- auth.uid() null = service role / SQL directo → permitido.
  if auth.uid() is not null and not (
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

  -- Jugadores activos
  select count(*) into v_activos
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false);

  select count(*) into v_activos_anterior
  from jugadores
  where club_id = p_club_id and estado = 'activo' and (es_externo is null or es_externo = false)
    and creado_en::date <= v_fin_mes_anterior;

  -- Torneos en curso
  select count(*) into v_torneos_activos
  from torneos
  where club_id = p_club_id and estado = 'en_curso';

  -- Morosos (conteo)
  select count(*) into v_morosos
  from mensualidades
  where club_id = p_club_id and mes = v_mes and anio = v_anio
    and (estado = 'pendiente' or estado = 'atrasado');

  select count(*) into v_morosos_anterior
  from mensualidades
  where club_id = p_club_id and mes = v_mes_anterior and anio = v_anio_anterior
    and (estado = 'pendiente' or estado = 'atrasado');

  -- Movimientos
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

  -- Lista de morosos con nombre y teléfono del jugador
  select json_agg(m) into v_morosos_lista
  from (
    select men.id, men.jugador_id, men.estado, j.nombre, j.telefono
    from mensualidades men
    join jugadores j on j.id = men.jugador_id
    where men.club_id = p_club_id
      and men.mes = v_mes and men.anio = v_anio
      and (men.estado = 'pendiente' or men.estado = 'atrasado')
  ) m;

  -- Lista de solicitudes pendientes
  select json_agg(s order by s.creado_en desc) into v_solicitudes_lista
  from (
    select id, nombre, rut, email, telefono, creado_en
    from solicitudes_jugador
    where club_id = p_club_id and estado = 'pendiente'
  ) s;

  -- Últimas 5 asistencias del mes
  select json_agg(a) into v_ultimas_asistencias
  from (
    select a.id, a.fecha, j.nombre as jugador_nombre
    from asistencia a
    join jugadores j on j.id = a.jugador_id
    where a.club_id = p_club_id and a.fecha >= v_inicio_mes
    order by a.fecha desc
    limit 5
  ) a;

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
    'ultimas_asistencias',      coalesce(v_ultimas_asistencias, '[]'::json),
    'mes',                      v_mes,
    'anio',                     v_anio
  );
end;
$$;

revoke execute on function dashboard_kpis(uuid) from anon;


-- ────────────────────────────────────────────────────────────
-- 2b. generar_mensualidades — solo admin de ese club, superadmin
--     o llamadas sin JWT (pg_cron / SQL editor).
--     (mismo cuerpo que 004, con candado al inicio)
-- ────────────────────────────────────────────────────────────
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
  if auth.uid() is not null and not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  insert into mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  select
    p_club_id,
    j.id,
    p_mes,
    p_anio,
    'pendiente',
    coalesce(j.mensualidad, case j.sesiones_limite
      when 4  then 15000
      when 8  then 25000
      when 12 then 30000
      when 16 then 40000
      else 25000
    end)
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

revoke execute on function generar_mensualidades(uuid, int, int) from anon;


-- ────────────────────────────────────────────────────────────
-- 3. INVITACIONES — fuera la lectura pública; el código se
--    valida con una función que exige conocer el código exacto
--    (no permite listar/enumerar).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitaciones_select_public" ON invitaciones;

CREATE OR REPLACE FUNCTION public.validar_invitacion(p_codigo text, p_club_id uuid DEFAULT NULL)
RETURNS TABLE (club_id uuid, club_nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.club_id, c.nombre
  FROM invitaciones i
  JOIN clubes c ON c.id = i.club_id
  WHERE i.codigo::text = p_codigo
    AND i.activa = true
    AND (p_club_id IS NULL OR i.club_id = p_club_id)
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.validar_invitacion(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.validar_invitacion(text, uuid) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. MENSUALIDADES — un jugador NO puede modificar sus
--    mensualidades (podía marcarlas 'pagado' él mismo).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mensualidades_jugador_update" ON mensualidades;


-- ────────────────────────────────────────────────────────────
-- 5. RESERVAS — aislar por club: admin/profesor solo ve y
--    administra reservas de jugadores o clases de SU club.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reservas_select" ON reservas;
CREATE POLICY "reservas_select" ON reservas
  FOR SELECT USING (
    jugador_id = get_my_jugador_id()
    OR (
      get_my_rol() IN ('admin', 'profesor')
      AND (
        EXISTS (SELECT 1 FROM jugadores j WHERE j.id = reservas.jugador_id AND j.club_id = get_my_club_id())
        OR EXISTS (SELECT 1 FROM clases c WHERE c.id = reservas.clase_id AND c.club_id = get_my_club_id())
      )
    )
  );

DROP POLICY IF EXISTS "reservas_admin_all" ON reservas;
CREATE POLICY "reservas_admin_all" ON reservas
  FOR ALL USING (
    get_my_rol() IN ('admin', 'profesor')
    AND (
      EXISTS (SELECT 1 FROM jugadores j WHERE j.id = reservas.jugador_id AND j.club_id = get_my_club_id())
      OR EXISTS (SELECT 1 FROM clases c WHERE c.id = reservas.clase_id AND c.club_id = get_my_club_id())
    )
  )
  WITH CHECK (
    get_my_rol() IN ('admin', 'profesor')
    AND (
      EXISTS (SELECT 1 FROM jugadores j WHERE j.id = reservas.jugador_id AND j.club_id = get_my_club_id())
      OR EXISTS (SELECT 1 FROM clases c WHERE c.id = reservas.clase_id AND c.club_id = get_my_club_id())
    )
  );

-- ============================================================
-- DONE 🔒
-- ============================================================
