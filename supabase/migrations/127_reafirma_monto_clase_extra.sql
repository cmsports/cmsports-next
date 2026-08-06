-- ────────────────────────────────────────────────────────────
-- Reafirma quién puede ponerle monto a una clase extraordinaria.
--
-- No cambia el comportamiento de producción: lo deja escrito en el número más
-- alto para que replayear las migraciones no lo revierta.
--
-- EL PROBLEMA: dos migraciones redefinen esta misma función y están numeradas
-- al revés de como se escribieron.
--
--   104_profesor_no_pone_precios     28-jul-2026   solo admin
--   100_clases_extra_monto_cero      30-jul-2026   admin + profesor  ← la buena
--
-- Aplicadas en el orden en que se escribieron —que es como se corrieron a
-- mano— gana la 100 y el profesor puede poner el monto. Verificado contra
-- producción: un profesor real pasa el control de rol.
--
-- Pero si alguien levanta un entorno nuevo y corre la carpeta en orden
-- numérico, la 104 se aplica DESPUÉS y revierte la 100 en silencio: el profe
-- deja de poder marcar una clase sin cargo y nadie entiende por qué en ese
-- entorno se comporta distinto. Un fallo silencioso y dependiente del entorno
-- es lo peor que puede pasar con permisos.
--
-- La regla vigente: el profesor SÍ pone el monto, porque marcar una clase como
-- "sin cargo" (monto = 0, el profe le debe una clase al alumno) es parte de su
-- trabajo, no una decisión administrativa. El 0 es válido; el negativo no.
-- ────────────────────────────────────────────────────────────

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
