-- ────────────────────────────────────────────────────────────
-- Cupos por día: el alumno avisa que no va, y ese lugar queda libre ese día.
--
-- Este cambio afecta a: Spinhouse (2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41).
-- El esquema es común —la tabla existe para todos— pero la pantalla se enciende
-- con el módulo `recuperar_clases`, y esta migración solo se lo activa a
-- Spinhouse. Buin no ve nada.
--
-- Por qué una tabla nueva y no `bloque_jugadores`: esa tabla dice a qué grupos
-- pertenece alguien, y cancelar UN martes no es dejar el grupo. Cerrarle la
-- vigencia lo sacaría del horario, de la lista de asistencia de todos los
-- martes siguientes y de la ficha. Acá se guardan hechos de una fecha.
--
-- Por qué una sola tabla con `tipo` y no dos: liberar y tomar son la misma
-- cuenta con distinto signo. El cupo de un bloque un día es
-- `cupo_maximo - inscritos + liberados - tomados`, y con dos tablas esa cuenta
-- necesita dos consultas que hay que acordarse de mantener alineadas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-08-28

BEGIN;
SELECT _migracion_nueva('226_cupos_por_dia_spinhouse');

-- ══ 1. La tabla ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bloque_cupos_dia (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES public.clubes(id)           ON DELETE CASCADE,
  bloque_id    uuid NOT NULL REFERENCES public.bloques_horario(id)  ON DELETE CASCADE,
  jugador_id   uuid NOT NULL REFERENCES public.jugadores(id)        ON DELETE CASCADE,
  fecha        date NOT NULL,

  -- 'libera': avisó que ese día no va, y su lugar queda disponible.
  -- 'toma'  : el profe lo puso ese día en un bloque que no es el suyo.
  tipo         text NOT NULL CHECK (tipo IN ('libera','toma')),

  -- Si avisó con 24 horas o más. Lo calcula `cancelar_bloque_dia`, nunca el
  -- cliente: es lo que decide si la clase se recupera o se pierde, así que un
  -- valor que llegue del navegador no sirve. Siempre false en las de tipo
  -- 'toma', donde no significa nada.
  con_derecho  boolean NOT NULL DEFAULT false,

  -- Por qué no va. Lo escribe el alumno; el profe lo lee antes de reubicarlo.
  motivo       text,

  creado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),

  -- Restricción entera y no parcial, por lo mismo que en clases_extraordinarias:
  -- PostgREST no puede apuntar un ON CONFLICT a un índice parcial.
  CONSTRAINT bloque_cupos_dia_unico UNIQUE (bloque_id, jugador_id, fecha)
);

-- La consulta caliente es "qué pasa en este club en este rango de fechas": la
-- pantalla del alumno pide dos semanas de una sola vez.
CREATE INDEX IF NOT EXISTS bloque_cupos_dia_club_fecha_idx
  ON public.bloque_cupos_dia (club_id, fecha);
CREATE INDEX IF NOT EXISTS bloque_cupos_dia_jugador_idx
  ON public.bloque_cupos_dia (jugador_id, fecha);

COMMENT ON TABLE public.bloque_cupos_dia IS
  'Movimientos de cupo de UNA fecha: quién libera el suyo y quién toma uno liberado. No cambia el horario semanal (eso es bloque_jugadores).';


-- ══ 2. Quién ve y quién escribe ═══════════════════════════════════════════
ALTER TABLE public.bloque_cupos_dia ENABLE ROW LEVEL SECURITY;

-- El staff ve y maneja todo lo de su club: es quien reubica.
DROP POLICY IF EXISTS "cupos_dia_staff" ON public.bloque_cupos_dia;
CREATE POLICY "cupos_dia_staff" ON public.bloque_cupos_dia
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin','profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin','profesor'));

-- El alumno ve SOLO las suyas.
--
-- Es tentador abrirle las de todo el club —necesita saber qué bloques tienen
-- lugar otro día, y eso sale de las cancelaciones de sus compañeros— pero eso
-- reabre exactamente el agujero que cerró la migración 101: con las filas en la
-- mano lista quién falta a qué, con nombre y con el motivo escrito. Lo que
-- necesita es un número de cupos libres, no la lista, y ese número se lo da
-- `cupos_libres_por_dia` más abajo.
DROP POLICY IF EXISTS "cupos_dia_lectura_club" ON public.bloque_cupos_dia;
DROP POLICY IF EXISTS "cupos_dia_propias" ON public.bloque_cupos_dia;
CREATE POLICY "cupos_dia_propias" ON public.bloque_cupos_dia
  FOR SELECT USING (jugador_id = get_my_jugador_id());

-- Escribir NO se abre por RLS: el alumno cancela por la función de abajo, que
-- es la que decide si le queda el derecho. Con un INSERT directo se lo pondría
-- él mismo.


-- ══ 3. Cancelar ═══════════════════════════════════════════════════════════
-- Devuelve si conserva el derecho a recuperar la clase.
CREATE OR REPLACE FUNCTION public.cancelar_bloque_dia(
  p_bloque_id uuid,
  p_fecha     date,
  p_motivo    text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club       uuid;
  v_jugador    uuid;
  v_inicio     time;
  v_dia        text;
  v_derecho    boolean;
BEGIN
  SELECT club_id, jugador_id INTO v_club, v_jugador FROM perfiles WHERE id = auth.uid();
  IF v_jugador IS NULL THEN
    RAISE EXCEPTION 'Solo un jugador puede avisar que no asistirá';
  END IF;

  SELECT b.hora_inicio, b.dia_semana INTO v_inicio, v_dia
  FROM bloques_horario b
  WHERE b.id = p_bloque_id AND b.club_id = v_club;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Ese bloque no es de este club';
  END IF;

  -- La fecha tiene que caer en el día de la semana del bloque. Sin esto, el
  -- cliente podía cancelar "el bloque de los martes" un jueves cualquiera y
  -- liberar un cupo que ese día no existe.
  IF v_dia <> (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[
       EXTRACT(DOW FROM p_fecha)::int + 1] THEN
    RAISE EXCEPTION 'Ese bloque no se dicta ese día';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM bloque_jugadores
    WHERE bloque_id = p_bloque_id AND jugador_id = v_jugador AND vigente_hasta IS NULL
  ) THEN
    RAISE EXCEPTION 'No estás inscrito en ese bloque';
  END IF;

  -- El derecho se decide acá, con el reloj del servidor en hora de Chile.
  -- `current_date`/`now()` sin la zona dan UTC y de noche adelantan el día.
  v_derecho := (p_fecha + v_inicio) - (now() AT TIME ZONE 'America/Santiago')
               >= interval '24 hours';

  INSERT INTO bloque_cupos_dia (club_id, bloque_id, jugador_id, fecha, tipo, con_derecho, motivo, creado_por)
  VALUES (v_club, p_bloque_id, v_jugador, p_fecha, 'libera', v_derecho, NULLIF(btrim(p_motivo), ''), auth.uid())
  ON CONFLICT (bloque_id, jugador_id, fecha) DO NOTHING;

  -- Si ya estaba cancelada, vale lo que se decidió la primera vez: volver a
  -- apretar el botón no puede devolverle un derecho que ya perdió.
  SELECT con_derecho INTO v_derecho FROM bloque_cupos_dia
  WHERE bloque_id = p_bloque_id AND jugador_id = v_jugador AND fecha = p_fecha;

  RETURN v_derecho;
END $$;

REVOKE ALL ON FUNCTION public.cancelar_bloque_dia(uuid, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancelar_bloque_dia(uuid, date, text) TO authenticated;


-- ══ 4. Deshacer ═══════════════════════════════════════════════════════════
-- Se canceló de más o se le acomodó el día. Solo mientras siga faltando más de
-- 24 horas: después de ese corte la clase ya está perdida, y deshacer sería la
-- forma de cancelar sin costo y arrepentirse a último momento.
CREATE OR REPLACE FUNCTION public.deshacer_cancelacion_dia(
  p_bloque_id uuid,
  p_fecha     date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club    uuid;
  v_jugador uuid;
  v_inicio  time;
BEGIN
  SELECT club_id, jugador_id INTO v_club, v_jugador FROM perfiles WHERE id = auth.uid();
  IF v_jugador IS NULL THEN
    RAISE EXCEPTION 'Solo un jugador puede deshacer su aviso';
  END IF;

  SELECT hora_inicio INTO v_inicio FROM bloques_horario
  WHERE id = p_bloque_id AND club_id = v_club;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Ese bloque no es de este club';
  END IF;

  IF (p_fecha + v_inicio) - (now() AT TIME ZONE 'America/Santiago') < interval '24 hours' THEN
    RAISE EXCEPTION 'Ya pasó el plazo: quedan menos de 24 horas para esa clase';
  END IF;

  DELETE FROM bloque_cupos_dia
  WHERE bloque_id = p_bloque_id AND jugador_id = v_jugador
    AND fecha = p_fecha AND tipo = 'libera';
END $$;

REVOKE ALL ON FUNCTION public.deshacer_cancelacion_dia(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.deshacer_cancelacion_dia(uuid, date) TO authenticated;


-- ══ 5. Asignar la recuperación ════════════════════════════════════════════
-- La hace el profe, no el alumno: el alumno ve qué hay libre y lo conversa por
-- WhatsApp. Acá se comprueba que ese día quede lugar de verdad.
CREATE OR REPLACE FUNCTION public.asignar_recuperacion_dia(
  p_jugador_id uuid,
  p_bloque_id  uuid,
  p_fecha      date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club      uuid;
  v_rol       text;
  v_dia       text;
  v_cupo      int;
  v_fijos     int;
  v_libera    int;
  v_toma      int;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  -- El NULL se comprueba aparte: `NULL NOT IN (...)` no es verdadero y dejaría
  -- pasar a quien no tiene rol.
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden asignar una recuperación';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'Ese alumno no es de este club';
  END IF;

  SELECT cupo_maximo, dia_semana INTO v_cupo, v_dia FROM bloques_horario
  WHERE id = p_bloque_id AND club_id = v_club;
  IF v_cupo IS NULL THEN
    RAISE EXCEPTION 'Ese bloque no es de este club';
  END IF;

  IF v_dia <> (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[
       EXTRACT(DOW FROM p_fecha)::int + 1] THEN
    RAISE EXCEPTION 'Ese bloque no se dicta ese día';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bloque_jugadores
    WHERE bloque_id = p_bloque_id AND jugador_id = p_jugador_id AND vigente_hasta IS NULL
  ) THEN
    RAISE EXCEPTION 'Ese alumno ya está inscrito en ese bloque';
  END IF;

  SELECT count(*) INTO v_fijos FROM bloque_jugadores
  WHERE bloque_id = p_bloque_id AND vigente_hasta IS NULL;

  SELECT count(*) FILTER (WHERE tipo = 'libera'),
         count(*) FILTER (WHERE tipo = 'toma')
    INTO v_libera, v_toma
  FROM bloque_cupos_dia WHERE bloque_id = p_bloque_id AND fecha = p_fecha;

  IF v_cupo - v_fijos + v_libera - v_toma <= 0 THEN
    RAISE EXCEPTION 'Ese bloque no tiene cupo ese día';
  END IF;

  INSERT INTO bloque_cupos_dia (club_id, bloque_id, jugador_id, fecha, tipo, creado_por)
  VALUES (v_club, p_bloque_id, p_jugador_id, p_fecha, 'toma', auth.uid())
  ON CONFLICT (bloque_id, jugador_id, fecha) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.asignar_recuperacion_dia(uuid, uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.asignar_recuperacion_dia(uuid, uuid, date) TO authenticated;


-- ══ 6. Qué hay libre, sin decir quién falta ═══════════════════════════════
-- Devuelve una fila por cada vez que un bloque se dicta en el rango, con
-- cuántos lugares quedan ESE día. Un número, no una lista: es lo único que el
-- alumno necesita para elegir dónde recuperar, y es lo único que puede ver sin
-- reabrir lo que cerró la migración 101.
--
-- SECURITY DEFINER porque cuenta `bloque_jugadores`, que el alumno no lee. Por
-- eso todo sale filtrado por el club de quien llama y nunca por un parámetro.
CREATE OR REPLACE FUNCTION public.cupos_libres_por_dia(
  p_desde date,
  p_hasta date
) RETURNS TABLE (bloque_id uuid, fecha date, libres int)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM perfiles WHERE id = auth.uid();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Sin club asignado';
  END IF;

  -- Techo al rango: la pantalla pide dos semanas. Sin el techo, un parámetro
  -- de diez años hace que esto recorra el horario 3.650 veces.
  IF p_hasta > p_desde + 60 THEN
    p_hasta := p_desde + 60;
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT d::date AS fecha,
           (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[EXTRACT(DOW FROM d)::int + 1] AS dia
    FROM generate_series(p_desde, p_hasta, interval '1 day') AS d
  ),
  clases AS (
    SELECT b.id, d.fecha, b.cupo_maximo
    FROM bloques_horario b
    JOIN dias d ON d.dia = b.dia_semana
    WHERE b.club_id = v_club
      AND b.activo
      AND b.vigente_desde <= d.fecha
      AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= d.fecha)
      -- Un día suspendido no se ofrece: esa clase no va a existir.
      AND NOT EXISTS (
        SELECT 1 FROM bloque_excepciones e
        WHERE e.bloque_id = b.id AND e.fecha = d.fecha
      )
  )
  SELECT
    c.id,
    c.fecha,
    (c.cupo_maximo
      -- Los fijos, contados a la fecha de esa clase y no a hoy: alguien que
      -- entra el lunes que viene ya ocupa lugar el lunes que viene.
      - (SELECT count(*) FROM bloque_jugadores bj
         WHERE bj.bloque_id = c.id
           AND bj.vigente_desde <= c.fecha
           AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= c.fecha))
      + (SELECT count(*) FROM bloque_cupos_dia m
         WHERE m.bloque_id = c.id AND m.fecha = c.fecha AND m.tipo = 'libera')
      - (SELECT count(*) FROM bloque_cupos_dia m
         WHERE m.bloque_id = c.id AND m.fecha = c.fecha AND m.tipo = 'toma')
    )::int
  FROM clases c
  ORDER BY c.fecha, c.id;
END $$;

REVOKE ALL ON FUNCTION public.cupos_libres_por_dia(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.cupos_libres_por_dia(date, date) TO authenticated;


-- ══ 7. Realtime ═══════════════════════════════════════════════════════════
-- Sin esto la pantalla se suscribe, se conecta y no llega nada nunca: el alumno
-- cancela en el teléfono y el profe sigue viendo el cupo ocupado. Ya mordió dos
-- veces (migraciones 121 y 142).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bloque_cupos_dia'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bloque_cupos_dia;
  END IF;
END $$;


-- ══ 8. El módulo, solo para Spinhouse ═════════════════════════════════════
UPDATE clubes
SET modulos_habilitados =
  array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'recuperar_clases')
WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND NOT ('recuperar_clases' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Espera solo Spinhouse:
-- SELECT nombre FROM clubes WHERE 'recuperar_clases' = ANY(modulos_habilitados);
--
-- Espera 'bloque_cupos_dia':
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'bloque_cupos_dia';
--
-- Espera 2 políticas (cupos_dia_staff, cupos_dia_lectura_club):
-- SELECT policyname FROM pg_policies WHERE tablename = 'bloque_cupos_dia';
