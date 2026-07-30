-- Permite monto = 0 en clases extraordinarias (clase sin cargo: el profe debe una clase).
--
-- Hasta ahora el constraint y las funciones bloqueaban monto <= 0. Eso impedía
-- que el profesor marcara una clase extra como "sin cargo" al momento de registrarla.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. Aflojar el constraint de la tabla ══════════════════════════════════════
-- Antes: monto IS NULL OR monto > 0
-- Ahora: monto IS NULL OR monto >= 0   (0 = sin cargo)

ALTER TABLE public.clases_extraordinarias
  DROP CONSTRAINT IF EXISTS clases_extraordinarias_monto_check;

ALTER TABLE public.clases_extraordinarias
  ADD CONSTRAINT clases_extraordinarias_monto_check
  CHECK (monto IS NULL OR monto >= 0);


-- ══ 2. registrar_clase_extraordinaria — permitir p_monto = 0 ════════════════
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

  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden registrar una clase extraordinaria';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bloques_horario WHERE id = p_bloque_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El bloque no es de este club';
  END IF;

  -- 0 = sin cargo (válido); negativo = error
  IF p_monto IS NOT NULL AND p_monto < 0 THEN
    RAISE EXCEPTION 'El monto no puede ser negativo';
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

  RETURN v_id;
END;
$$;


-- ══ 3. asignar_monto_clase_extraordinaria — permitir p_monto = 0 ════════════
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

  -- 0 = sin cargo (válido); negativo = error
  IF p_monto IS NOT NULL AND p_monto < 0 THEN
    RAISE EXCEPTION 'El monto no puede ser negativo';
  END IF;

  SELECT pagada_en INTO v_pagada FROM clases_extraordinarias
  WHERE id = p_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase extraordinaria no encontrada en el club'; END IF;

  IF v_pagada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa clase ya está pagada: hay que revertir el pago antes de cambiar el monto';
  END IF;

  UPDATE clases_extraordinarias SET monto = p_monto WHERE id = p_id;
END;
$$;


COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────────
SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'clases_extraordinarias_monto_check'
      AND conrelid = 'public.clases_extraordinarias'::regclass) AS constraint_actual,
  (SELECT count(*) FROM clases_extraordinarias WHERE monto = 0)   AS ya_sin_cargo;
