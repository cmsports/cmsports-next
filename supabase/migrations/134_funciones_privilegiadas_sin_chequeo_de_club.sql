-- Cuatro funciones privilegiadas se podían llamar SIN INICIAR SESIÓN
-- (otorgadas a `anon`) y no comprobaban a qué club pertenecía nada.
--
-- Encontrado en la auditoría pedida tras el incidente de la migración 089:
-- "que jamás se cuele info de un club a otro". La auditoría anterior (RLS de
-- las tablas) no podía verlo — estas funciones son SECURITY DEFINER
-- justamente para saltarse esa capa. Había que leer cada función una por una
-- y cruzarla contra sus permisos reales (pg_proc.proacl), no contra lo que
-- dice el código de la app.
--
-- Lo encontrado, otorgado a `anon` (cualquiera en internet, sin sesión):
--
--   1. traspasar_jugador — solo miraba que el rol del que llama fuera
--      admin/profesor/superadmin, nunca que ese jugador fuera de SU club. Y el
--      chequeo tenía un agujero peor: `v_rol_actor NOT IN (...)` con
--      v_rol_actor en NULL (sin sesión) evalúa a NULL, no a verdadero — en
--      PL/pgSQL un IF con NULL no dispara el RAISE. Cualquiera podía mover
--      cualquier jugador de cualquier club a cualquier otro club.
--
--   2. eliminar_jugador_atomico — cero chequeos. Cualquiera podía borrar
--      cualquier jugador de cualquier club con solo su id.
--
--   3. presupuesto_vs_real — cero chequeos. Cualquiera podía leer el
--      presupuesto completo (planificado vs. real, por categoría) de
--      cualquier club con solo pasar su club_id.
--
--   4. consumir_sesion_sin_asistencia — cero chequeos. Cualquiera podía
--      inflar el contador de sesiones usadas de cualquier jugador de
--      cualquier club.
--
-- Además, tres funciones-ayuda (aplicar_dias_jugador, dias_canonicos_jugador,
-- recalcular_sesiones) también estaban otorgadas a `anon`/`authenticated` sin
-- ningún chequeo. Solo se usan desde triggers internos —que corren con el
-- privilegio del dueño de la función, no con el del que llama—, así que
-- revocarles el permiso directo no rompe nada. Quedan cerradas por completo,
-- mismo criterio que club_photos en la migración 133.
--
-- dashboard_kpis y generar_mensualidades usan el patrón
-- `if auth.uid() is not null and not (...)` para el chequeo de rol: si
-- auth.uid() es NULL, la condición completa se salta. Hoy no son explotables
-- porque no están otorgadas a `anon` (se necesita sesión para siquiera
-- ejecutarlas, y con sesión auth.uid() nunca es NULL) — pero es un patrón
-- frágil: si algún día alguien les otorga acceso a `anon` sin darse cuenta de
-- esto, el agujero vuelve solo. Se endurecen igual, por las dudas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('134_funciones_privilegiadas_sin_chequeo_de_club');

-- ══ 1. traspasar_jugador ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION traspasar_jugador(p_jugador_id uuid, p_club_id_nuevo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_actor      text;
  v_club_actor     uuid;
  v_club_id_viejo  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_jugador_id IS NULL OR p_club_id_nuevo IS NULL THEN
    RAISE EXCEPTION 'Falta el jugador o el club de destino';
  END IF;

  SELECT rol, club_id INTO v_rol_actor, v_club_actor FROM perfiles WHERE id = auth.uid();
  IF v_rol_actor IS NULL OR v_rol_actor NOT IN ('admin', 'profesor', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el admin, el profesor o el superadmin pueden traspasar un jugador';
  END IF;

  SELECT club_id INTO v_club_id_viejo FROM jugadores WHERE id = p_jugador_id;
  IF v_club_id_viejo IS NULL THEN
    RAISE EXCEPTION 'Jugador % no existe', p_jugador_id;
  END IF;

  -- El agujero real: nada impedía traspasar un jugador que no fuera del
  -- club de quien llama. Un admin de cualquier club podía mover a alguien de
  -- otro club sin ninguna relación con él.
  IF v_rol_actor <> 'superadmin' AND v_club_actor IS DISTINCT FROM v_club_id_viejo THEN
    RAISE EXCEPTION 'Solo puedes traspasar jugadores de tu propio club';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = p_club_id_nuevo) THEN
    RAISE EXCEPTION 'Club de destino % no existe', p_club_id_nuevo;
  END IF;

  -- Autorizar el cambio de jugadores.club_id ante el trigger de blindaje.
  PERFORM set_config('cmsports.traspaso_activo', p_jugador_id::text, true);

  UPDATE jugadores SET club_id = p_club_id_nuevo
    WHERE id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE asistencia SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE mensualidades SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE clases_extraordinarias
     SET club_id = p_club_id_nuevo,
         bloque_id = NULL
    WHERE jugador_id = p_jugador_id
      AND (club_id IS DISTINCT FROM p_club_id_nuevo OR bloque_id IS NOT NULL);

  UPDATE bloque_jugadores bj
     SET vigente_hasta = current_date
    FROM bloques_horario b
   WHERE bj.bloque_id = b.id
     AND bj.jugador_id = p_jugador_id
     AND bj.vigente_hasta IS NULL
     AND b.club_id IS DISTINCT FROM p_club_id_nuevo;

  UPDATE perfiles SET club_id = p_club_id_nuevo
    WHERE jugador_id = p_jugador_id AND club_id IS DISTINCT FROM p_club_id_nuevo;

  PERFORM set_config('cmsports.traspaso_activo', '', true);
END;
$$;

REVOKE ALL ON FUNCTION traspasar_jugador(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION traspasar_jugador(uuid, uuid) TO authenticated;


-- ══ 2. eliminar_jugador_atomico ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION eliminar_jugador_atomico(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_club_actor    uuid;
  v_club_jugador  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT rol, club_id INTO v_rol, v_club_actor FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el administrador puede eliminar un jugador';
  END IF;

  SELECT club_id INTO v_club_jugador FROM jugadores WHERE id = p_jugador_id;
  IF v_club_jugador IS NULL THEN
    RAISE EXCEPTION 'Jugador no encontrado';
  END IF;
  IF v_rol <> 'superadmin' AND v_club_actor IS DISTINCT FROM v_club_jugador THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  -- Referencias en otras entidades: se limpian, no se borran filas ajenas.
  UPDATE torneos SET cabeza_serie_1 = NULL WHERE cabeza_serie_1 = p_jugador_id;
  UPDATE torneos SET cabeza_serie_2 = NULL WHERE cabeza_serie_2 = p_jugador_id;
  UPDATE torneos SET campeon_id = NULL WHERE campeon_id = p_jugador_id;
  UPDATE torneos SET subcampeon_id = NULL WHERE subcampeon_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_primero_id = NULL WHERE desempate_primero_id = p_jugador_id;
  UPDATE torneo_grupos SET desempate_segundo_id = NULL WHERE desempate_segundo_id = p_jugador_id;

  -- jugador_a, jugador_b y ganador se sueltan en un solo UPDATE: el check de
  -- que el ganador sea uno de los dos participantes se evalúa por fila apenas
  -- termina el statement, así que no puede quedar a medio soltar entre dos
  -- UPDATE separados (migración 132).
  UPDATE torneo_partidos
  SET jugador_a = CASE WHEN jugador_a = p_jugador_id THEN NULL ELSE jugador_a END,
      jugador_b = CASE WHEN jugador_b = p_jugador_id THEN NULL ELSE jugador_b END,
      ganador   = CASE WHEN ganador   = p_jugador_id THEN NULL ELSE ganador   END
  WHERE jugador_a = p_jugador_id OR jugador_b = p_jugador_id OR ganador = p_jugador_id;

  UPDATE partidos
  SET jugador_a = CASE WHEN jugador_a = p_jugador_id THEN NULL ELSE jugador_a END,
      jugador_b = CASE WHEN jugador_b = p_jugador_id THEN NULL ELSE jugador_b END,
      ganador   = CASE WHEN ganador   = p_jugador_id THEN NULL ELSE ganador   END
  WHERE jugador_a = p_jugador_id OR jugador_b = p_jugador_id OR ganador = p_jugador_id;

  UPDATE fotos_galeria SET jugador_id = NULL WHERE jugador_id = p_jugador_id;
  UPDATE liga_partidos SET arbitro_id = NULL WHERE arbitro_id = p_jugador_id;
  UPDATE liga_partidos SET ganador_id = NULL WHERE ganador_id = p_jugador_id;
  DELETE FROM liga_partidos WHERE jugador_a_id = p_jugador_id OR jugador_b_id = p_jugador_id;

  -- La plata NO se borra: el movimiento queda, sin dueño.
  UPDATE movimientos SET jugador_id = NULL WHERE jugador_id = p_jugador_id;

  DELETE FROM asistencia WHERE jugador_id = p_jugador_id;
  DELETE FROM mensualidades WHERE jugador_id = p_jugador_id;
  DELETE FROM cuotas WHERE jugador_id = p_jugador_id;
  DELETE FROM evaluaciones_trimestrales WHERE jugador_id = p_jugador_id;
  DELETE FROM torneos_externos WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_pagos WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_felicitaciones WHERE jugador_id = p_jugador_id;
  DELETE FROM torneo_cabezas_serie WHERE jugador_id = p_jugador_id;
  DELETE FROM grupo_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM liga_jugador_pagos WHERE jugador_id = p_jugador_id;
  DELETE FROM liga_division_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM clases_extraordinarias WHERE jugador_id = p_jugador_id;
  DELETE FROM jugador_documentos WHERE jugador_id = p_jugador_id;
  DELETE FROM jugador_horario_historial WHERE jugador_id = p_jugador_id;
  DELETE FROM auditoria_asistencia WHERE jugador_id = p_jugador_id;
  DELETE FROM auditoria_mensualidades WHERE jugador_id = p_jugador_id;
  DELETE FROM bloque_jugadores WHERE jugador_id = p_jugador_id;
  DELETE FROM perfiles WHERE jugador_id = p_jugador_id;

  DELETE FROM jugadores WHERE id = p_jugador_id;
END;
$$;

REVOKE ALL ON FUNCTION eliminar_jugador_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eliminar_jugador_atomico(uuid) TO authenticated;


-- ══ 3. presupuesto_vs_real ═════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION presupuesto_vs_real(p_club_id uuid, p_anio integer, p_mes integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date := make_date(p_anio, p_mes, 1);
  v_fin date := (v_inicio + interval '1 month - 1 day')::date;
  v_result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT (
    get_my_rol() = 'superadmin'
    OR (get_my_rol() = 'admin' AND p_club_id = get_my_club_id())
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  with planificado as (
    select categoria, monto_planificado
    from presupuestos
    where club_id = p_club_id and anio = p_anio and mes = p_mes
  ),
  real as (
    select categoria, sum(monto) as monto_real
    from movimientos
    where club_id = p_club_id and tipo = 'gasto'
      and fecha >= v_inicio::text and fecha <= v_fin::text
    group by categoria
  ),
  combinado as (
    select
      coalesce(p.categoria, r.categoria) as categoria,
      coalesce(p.monto_planificado, 0) as planificado,
      coalesce(r.monto_real, 0) as real
    from planificado p
    full outer join real r on p.categoria = r.categoria
  )
  select json_agg(
    json_build_object(
      'categoria', categoria,
      'planificado', planificado,
      'real', real,
      'diferencia', planificado - real,
      'pct_uso', case when planificado > 0 then round((real / planificado) * 100) else null end
    )
  ) into v_result from combinado;

  return coalesce(v_result, '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION presupuesto_vs_real(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION presupuesto_vs_real(uuid, integer, integer) TO authenticated;


-- ══ 4. consumir_sesion_sin_asistencia ══════════════════════════════════════
CREATE OR REPLACE FUNCTION consumir_sesion_sin_asistencia(p_club_id uuid, p_jugador_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT (
    get_my_rol() = 'superadmin'
    OR (get_my_rol() IN ('admin', 'profesor') AND p_club_id = get_my_club_id())
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE jugadores
     SET sesiones_usadas = sesiones_usadas + 1
   WHERE id        = ANY(p_jugador_ids)
     AND club_id   = p_club_id
     AND estado    = 'activo';
END;
$$;

REVOKE ALL ON FUNCTION consumir_sesion_sin_asistencia(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consumir_sesion_sin_asistencia(uuid, uuid[]) TO authenticated;


-- ══ 5. Ayudantes de solo uso interno (triggers) ════════════════════════════
-- Solo las invoca sync_dias_tras_bloque / sync_dias_tras_inscripcion /
-- registrar_asistencia_segura / jugadores_dias_solo_desde_bloques, que corren
-- como su propio dueño (no como el que originó la operación). Revocar el
-- acceso directo no les afecta.
REVOKE ALL ON FUNCTION aplicar_dias_jugador(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dias_canonicos_jugador(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION recalcular_sesiones(uuid) FROM PUBLIC, anon, authenticated;


-- ══ 6. Blindar el patrón frágil, aunque hoy no sea explotable ═════════════
-- No están otorgadas a `anon`, así que hoy no hay forma de llamarlas sin
-- sesión — pero el patrón `auth.uid() is not null and not (...)` se salta el
-- chequeo entero si algún día alguien las otorga a `anon` sin darse cuenta.
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
  v_ultimas_asistencias  json;
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

-- CREATE OR REPLACE no puede quitarle los valores por defecto a los
-- parámetros de una función que ya los tenía; hay que soltarla primero.
DROP FUNCTION IF EXISTS generar_mensualidades(uuid, integer, integer);

CREATE FUNCTION generar_mensualidades(p_club_id uuid, p_mes integer, p_anio integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_insertados int := 0;
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

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Ninguna de las cuatro críticas debe seguir otorgada a anon.
SELECT p.proname, array_agg(g.grantee::regrole::text) AS puede_ejecutar
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
LEFT JOIN LATERAL (SELECT (aclexplode(p.proacl)).grantee) g ON true
WHERE p.proname IN (
  'traspasar_jugador', 'eliminar_jugador_atomico', 'presupuesto_vs_real',
  'consumir_sesion_sin_asistencia', 'aplicar_dias_jugador',
  'dias_canonicos_jugador', 'recalcular_sesiones'
)
GROUP BY p.proname;
