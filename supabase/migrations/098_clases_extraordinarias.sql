-- La clase extraordinaria: el jugador que viene a un bloque que no es el suyo.
--
-- ARREGLA UN ERROR QUE YA ESTÁ PASANDO. Hoy, marcar presente a alguien un día
-- que no le toca inserta una fila en `asistencia`, y eso hace dos cosas mal:
--
--   1. `recalcular_sesiones` cuenta count(*) de esa tabla, así que le descuenta
--      una sesión del plan que pagó. No corresponde: vino de más, no de menos.
--   2. `calendarioJugador` omite los días sin programación, así que la fila
--      queda invisible en su calendario. Se cobró una sesión y no se ve dónde.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `asistencia`:
--
--   · `asistencia` tiene un índice único (jugador_id, fecha). Si alguien viene
--     a una clase extra un día que además entrena, no hay dónde poner la
--     segunda fila.
--   · Estando afuera, no descuenta sesión ni entra en el porcentaje sin tocar
--     una línea del cálculo actual. Nada de lo que hoy funciona cambia.
--   · Y es lo que realmente es: un hecho cobrable, no un estado de asistencia.
--
-- El monto nace en NULL. Igual que las cuotas: si nadie lo decidió, queda
-- visiblemente vacío antes que inventado.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. La tabla ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.clases_extraordinarias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES public.clubes(id)          ON DELETE CASCADE,
  jugador_id     uuid NOT NULL REFERENCES public.jugadores(id)       ON DELETE CASCADE,
  fecha          date NOT NULL,
  -- El bloque al que vino. Queda en NULL si ese bloque se elimina después: se
  -- pierde el detalle, pero no el cobro.
  bloque_id      uuid REFERENCES public.bloques_horario(id)          ON DELETE SET NULL,
  hora           time,
  -- NULL = todavía nadie le puso precio. Nunca un monto de relleno.
  monto          integer CHECK (monto IS NULL OR monto > 0),
  motivo         text,
  -- Cuándo se mandó a cobro, y con qué movimiento se saldó.
  cobrada_en     timestamptz,
  movimiento_id  uuid REFERENCES public.movimientos(id)              ON DELETE SET NULL,
  pagada_en      timestamptz,
  -- Mismo patrón que auditoria_asistencia.usuario_id, que sí funciona.
  registrado_por uuid REFERENCES auth.users(id)                      ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),

  -- Restricción entera, no parcial: PostgREST no puede apuntar un ON CONFLICT
  -- a un índice parcial, y eso ya nos mordió dos veces (clases, mensualidades).
  CONSTRAINT clases_extra_unica UNIQUE (jugador_id, fecha, bloque_id)
);

CREATE INDEX IF NOT EXISTS clases_extra_club_fecha_idx
  ON public.clases_extraordinarias (club_id, fecha);
CREATE INDEX IF NOT EXISTS clases_extra_jugador_idx
  ON public.clases_extraordinarias (jugador_id, fecha);
-- Para la lista de "qué falta cobrar", que es la consulta de Finanzas.
CREATE INDEX IF NOT EXISTS clases_extra_por_cobrar_idx
  ON public.clases_extraordinarias (club_id) WHERE pagada_en IS NULL;


-- ══ 2. Quién ve y quién escribe ═══════════════════════════════════════════
ALTER TABLE public.clases_extraordinarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clases_extra_staff" ON public.clases_extraordinarias;
CREATE POLICY "clases_extra_staff" ON public.clases_extraordinarias
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin','profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin','profesor'));

-- El jugador ve las suyas: son plata que se le va a cobrar y tiene derecho a
-- saber cuáles y cuánto.
DROP POLICY IF EXISTS "clases_extra_propias" ON public.clases_extraordinarias;
CREATE POLICY "clases_extra_propias" ON public.clases_extraordinarias
  FOR SELECT USING (jugador_id = get_my_jugador_id());


-- ══ 3. Registrarla ════════════════════════════════════════════════════════
-- Lo que la hace extraordinaria es una sola cosa: el jugador NO estaba inscrito
-- en ese bloque esa fecha. Se comprueba acá y no en la pantalla, porque es la
-- definición y no un detalle de presentación.
CREATE OR REPLACE FUNCTION public.registrar_clase_extraordinaria(
  p_jugador_id uuid,
  p_fecha      date,
  p_bloque_id  uuid,
  p_hora       time DEFAULT NULL,
  p_monto      integer DEFAULT NULL,
  p_motivo     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_id   uuid;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();

  -- El NULL se comprueba aparte: en SQL `NULL NOT IN (...)` no es verdadero, y
  -- un guardia escrito sin esto deja pasar al que no tiene rol.
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden registrar una clase extraordinaria';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = p_bloque_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El bloque no es de este club';
  END IF;

  IF p_monto IS NOT NULL AND p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bloque_jugadores bj
    WHERE bj.bloque_id = p_bloque_id
      AND bj.jugador_id = p_jugador_id
      AND bj.vigente_desde <= p_fecha
      AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= p_fecha)
  ) THEN
    RAISE EXCEPTION 'Ese jugador sí pertenece a ese grupo: su asistencia es la normal, no una extra';
  END IF;

  INSERT INTO clases_extraordinarias
    (club_id, jugador_id, fecha, bloque_id, hora, monto, motivo, registrado_por)
  VALUES
    (v_club, p_jugador_id, p_fecha, p_bloque_id,
     COALESCE(p_hora, (now() AT TIME ZONE 'America/Santiago')::time),
     p_monto, NULLIF(btrim(p_motivo), ''), auth.uid())
  ON CONFLICT ON CONSTRAINT clases_extra_unica DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM clases_extraordinarias
    WHERE jugador_id = p_jugador_id AND fecha = p_fecha AND bloque_id = p_bloque_id;
  END IF;

  -- A propósito NO se llama a recalcular_sesiones: una clase extra no consume
  -- el plan. Ese es el punto de que viva fuera de `asistencia`.
  RETURN v_id;
END;
$$;


-- ══ 4. Ponerle precio ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.asignar_monto_clase_extraordinaria(
  p_id    uuid,
  p_monto integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_pagada timestamptz;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden cambiar el monto';
  END IF;

  IF p_monto IS NOT NULL AND p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  SELECT pagada_en INTO v_pagada FROM clases_extraordinarias
  WHERE id = p_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase extraordinaria no encontrada en el club'; END IF;

  -- Cambiar el precio de algo ya cobrado descuadra el libro contra el movimiento
  -- que se generó. Primero se revierte el pago.
  IF v_pagada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa clase ya está pagada: hay que revertir el pago antes de cambiar el monto';
  END IF;

  UPDATE clases_extraordinarias SET monto = p_monto WHERE id = p_id;
END;
$$;


-- ══ 5. Borrarla ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.eliminar_clase_extraordinaria(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_pagada timestamptz;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden borrar una clase extraordinaria';
  END IF;

  SELECT pagada_en INTO v_pagada FROM clases_extraordinarias
  WHERE id = p_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase extraordinaria no encontrada en el club'; END IF;

  IF v_pagada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa clase ya está pagada: hay que revertir el pago antes de borrarla';
  END IF;

  DELETE FROM clases_extraordinarias WHERE id = p_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.registrar_clase_extraordinaria(uuid, date, uuid, time, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.asignar_monto_clase_extraordinaria(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eliminar_clase_extraordinaria(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_clase_extraordinaria(uuid, date, uuid, time, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_monto_clase_extraordinaria(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_clase_extraordinaria(uuid) TO authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM clases_extraordinarias)                        AS extras,
  (SELECT count(*) FROM pg_policies
    WHERE tablename = 'clases_extraordinarias')                        AS politicas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'registrar_clase_extraordinaria',
      'asignar_monto_clase_extraordinaria',
      'eliminar_clase_extraordinaria'))                                AS funciones;
