-- ────────────────────────────────────────────────────────────
-- Los créditos de recuperación caducan a los 30 días, los feriados no dan
-- crédito, y el saldo se calcula en un solo lugar.
--
-- Este cambio afecta a: Spinhouse (único club con el módulo `recuperar_clases`).
--
-- Sale de la auditoría en `docs/auditoria-spinhouse-clases.md`, hallazgos 1, 2,
-- 3 y 7. Los cuatro nacían de lo mismo: la regla de cuándo hay derecho y hasta
-- cuándo dura no estaba escrita en ningún lado completo.
--
-- ── QUÉ CAMBIA ───────────────────────────────────────────────────────────
--
-- 1. `cancelar_bloque_dia` rechaza los días suspendidos. Cancelar un feriado
--    daba derecho a recuperar una clase que nunca iba a existir (hallazgo 2).
--    La pantalla ya los escondía, pero la pantalla no es el guardia.
--
-- 2. `cancelar_bloque_dia` rechaza las fechas fuera de las próximas dos
--    semanas. Sin esto se cancelaba el martes 2 de marzo de 2027 —pasaba todos
--    los guardias, faltan más de 24 horas— y cada fecha futura distinta sumaba
--    un crédito más, sin techo (hallazgo 1). Con la caducidad de 30 días esto
--    dejaba de ser un detalle: sin el tope, se fabrican créditos siempre
--    frescos y la caducidad no sirve para nada.
--
-- 3. `saldos_recuperacion()` pasa a ser la ÚNICA fuente del saldo. Antes cada
--    pantalla lo calculaba por su cuenta con consultas distintas, y el alumno
--    veía menos créditos que el profe (hallazgo 3). Además le devuelve al
--    profe solo lo que necesita, en vez de toda la historia del club en cada
--    carga de pantalla (hallazgo 7).
--
-- ── LA CADUCIDAD ─────────────────────────────────────────────────────────
-- Un crédito vence 30 días después de la fecha de la CLASE que se canceló, no
-- de cuándo se avisó. Es lo que el alumno entiende: "falté el 5, tengo hasta el
-- 4 del mes siguiente".
--
-- Los créditos se consumen en orden, del más viejo al más nuevo, para que el
-- que está por vencer se use primero. Por eso el saldo se calcula numerando las
-- cancelaciones y descartando las primeras N —las ya usadas—: así el resultado
-- nunca puede quedar negativo, que era otro efecto del cálculo anterior.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('231_recuperaciones_caducan_y_feriados');

-- ══ 1. Cancelar, con los dos guardias que faltaban ════════════════════════
CREATE OR REPLACE FUNCTION public.cancelar_bloque_dia(
  p_bloque_id uuid,
  p_fecha     date,
  p_motivo    text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club    uuid;
  v_jugador uuid;
  v_inicio  time;
  v_dia     text;
  v_hoy     date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_derecho boolean;
BEGIN
  SELECT p.club_id, p.jugador_id INTO v_club, v_jugador
  FROM perfiles p WHERE p.id = auth.uid();
  IF v_jugador IS NULL THEN
    RAISE EXCEPTION 'Solo un jugador puede avisar que no asistirá';
  END IF;

  SELECT b.hora_inicio, b.dia_semana INTO v_inicio, v_dia
  FROM bloques_horario b
  WHERE b.id = p_bloque_id AND b.club_id = v_club;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Ese bloque no es de este club';
  END IF;

  -- La fecha tiene que caer en el día de la semana del bloque.
  IF v_dia <> (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[
       EXTRACT(DOW FROM p_fecha)::int + 1] THEN
    RAISE EXCEPTION 'Ese bloque no se dicta ese día';
  END IF;

  -- NUEVO — hallazgo 1. Solo las próximas dos semanas, que es lo que la
  -- pantalla ofrece (DIAS_VENTANA en `lib/domain/cuposDia.ts`). Si ese número
  -- cambia allá, hay que cambiarlo acá.
  IF p_fecha < v_hoy OR p_fecha > v_hoy + 14 THEN
    RAISE EXCEPTION 'Solo se puede avisar por las clases de las próximas dos semanas';
  END IF;

  -- NUEVO — hallazgo 2. Un día suspendido no tiene clase que perder.
  IF EXISTS (
    SELECT 1 FROM bloque_excepciones e
    WHERE e.bloque_id = p_bloque_id AND e.fecha = p_fecha
  ) THEN
    RAISE EXCEPTION 'Ese día no hay clases, así que no hay nada que avisar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM bloque_jugadores bj
    WHERE bj.bloque_id = p_bloque_id AND bj.jugador_id = v_jugador
      AND bj.vigente_hasta IS NULL
  ) THEN
    RAISE EXCEPTION 'No estás inscrito en ese bloque';
  END IF;

  v_derecho := (p_fecha + v_inicio) - (now() AT TIME ZONE 'America/Santiago')
               >= interval '24 hours';

  INSERT INTO bloque_cupos_dia
    (club_id, bloque_id, jugador_id, fecha, tipo, con_derecho, motivo, creado_por)
  VALUES (v_club, p_bloque_id, v_jugador, p_fecha, 'libera', v_derecho,
          NULLIF(btrim(p_motivo), ''), auth.uid())
  ON CONFLICT (bloque_id, jugador_id, fecha) DO NOTHING;

  -- Si ya estaba cancelada, vale lo que se decidió la primera vez.
  SELECT c.con_derecho INTO v_derecho FROM bloque_cupos_dia c
  WHERE c.bloque_id = p_bloque_id AND c.jugador_id = v_jugador AND c.fecha = p_fecha;

  RETURN v_derecho;
END $$;

REVOKE ALL ON FUNCTION public.cancelar_bloque_dia(uuid, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancelar_bloque_dia(uuid, date, text) TO authenticated;


-- ══ 2. El saldo, en un solo lugar ═════════════════════════════════════════
-- Devuelve una fila por alumno CON créditos pendientes. Los que no tienen no
-- aparecen: "sin saldo" es la ausencia de fila, no un cero.
--
-- El alumno solo se ve a sí mismo; el staff ve a todo su club. Es la misma
-- forma que `cupos_libres_por_dia`: un número, no la lista de quién faltó.
CREATE OR REPLACE FUNCTION public.saldos_recuperacion()
RETURNS TABLE (jugador_id uuid, saldo int, vence_el date)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_yo   uuid;
  v_hoy  date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT p.club_id, p.rol, p.jugador_id INTO v_club, v_rol, v_yo
  FROM perfiles p WHERE p.id = auth.uid();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Sin club asignado';
  END IF;

  RETURN QUERY
  WITH creditos AS (
    -- Las cancelaciones con derecho que todavía no vencieron, numeradas de la
    -- más vieja a la más nueva.
    SELECT c.jugador_id AS jug, c.fecha,
           row_number() OVER (PARTITION BY c.jugador_id ORDER BY c.fecha) AS rn
    FROM bloque_cupos_dia c
    WHERE c.club_id = v_club
      AND c.tipo = 'libera'
      AND c.con_derecho
      AND c.fecha >= v_hoy - 30
  ),
  usados AS (
    -- Las recuperaciones ya asignadas en la misma ventana. Se cuentan contra
    -- los créditos más viejos, que son los que están por vencer.
    SELECT c.jugador_id AS jug, count(*) AS n
    FROM bloque_cupos_dia c
    WHERE c.club_id = v_club
      AND c.tipo = 'toma'
      AND c.fecha >= v_hoy - 30
    GROUP BY c.jugador_id
  )
  SELECT cr.jug,
         count(*)::int,
         -- El primero que vence: 30 días después de la clase que se perdió.
         (min(cr.fecha) + 30)::date
  FROM creditos cr
  LEFT JOIN usados u ON u.jug = cr.jug
  -- Descartar los ya consumidos por número de orden es lo que impide que el
  -- saldo quede negativo: sobran filas o no sobra ninguna, nunca "menos que
  -- cero". El cálculo anterior restaba y podía dar -1.
  WHERE cr.rn > COALESCE(u.n, 0)
    AND (v_rol IN ('admin','superadmin','profesor') OR cr.jug = v_yo)
  GROUP BY cr.jug;
END $$;

REVOKE ALL ON FUNCTION public.saldos_recuperacion() FROM public;
GRANT EXECUTE ON FUNCTION public.saldos_recuperacion() TO authenticated;

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Simulando la sesión de un alumno (reemplazar el UUID por uno de perfiles):
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"UUID-DEL-PERFIL"}';
-- SELECT * FROM saldos_recuperacion();
-- ROLLBACK;
--
-- Ningún saldo puede ser negativo ni cero (como admin de Spinhouse):
-- SELECT count(*) FROM saldos_recuperacion() WHERE saldo <= 0;   -- espera 0
--
-- Y ningún crédito vencido debería seguir contando:
-- SELECT count(*) FROM saldos_recuperacion()
-- WHERE vence_el < (now() AT TIME ZONE 'America/Santiago')::date; -- espera 0
