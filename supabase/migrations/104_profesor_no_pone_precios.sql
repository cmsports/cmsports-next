-- El profesor marca la clase extra; el precio lo pone un admin.
--
-- Hoy las tres funciones de la 098 y la 099 aceptan por igual a admin,
-- superadmin y profesor. Eso deja que un profesor le ponga precio a una clase y
-- la mande a cobro, que es decidir plata.
--
-- La regla del club: Alejandro registra que el alumno vino de más y ahí queda,
-- en "Cuota por asignar". Cuánto se le cobra y cuándo lo define un admin.
--
-- QUÉ SIGUE PUDIENDO EL PROFESOR:
--   · registrar la clase extra          — es lo suyo, ve quién viene
--   · completarle el grupo              — es información, no plata
--   · borrarla mientras no tenga precio — para deshacer su propia equivocación
--
-- El borrado se le permite solo sin monto a propósito. Si ya tiene precio hay
-- un cobro en camino, y borrarlo lo haría desaparecer sin que el admin se
-- entere. Sin precio todavía no es plata: es una marca mal puesta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. El monto, solo admin ═══════════════════════════════════════════════
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

  -- El NULL se comprueba aparte: `NULL NOT IN (...)` no es verdadero en SQL.
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'El precio de una clase extra lo pone un administrador';
  END IF;

  IF p_monto IS NOT NULL AND p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
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


-- ══ 2. Mandar a cobro, solo admin ═════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enviar_clases_extra_a_cobro(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid; v_rol text; v_n integer;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Mandar a cobro es cosa de un administrador';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'Lista de clases inválida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM clases_extraordinarias
    WHERE id = ANY(p_ids) AND club_id = v_club AND monto IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay clases sin monto asignado: primero hay que ponerles precio';
  END IF;

  UPDATE clases_extraordinarias
  SET cobrada_en = now()
  WHERE id = ANY(p_ids) AND club_id = v_club AND pagada_en IS NULL AND cobrada_en IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


-- ══ 3. Borrar: el profesor solo mientras no tenga precio ══════════════════
CREATE OR REPLACE FUNCTION public.eliminar_clase_extraordinaria(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid; v_rol text; v_pagada timestamptz; v_monto integer;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden borrar una clase extraordinaria';
  END IF;

  SELECT pagada_en, monto INTO v_pagada, v_monto FROM clases_extraordinarias
  WHERE id = p_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase extraordinaria no encontrada en el club'; END IF;

  IF v_pagada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa clase ya está pagada: hay que revertir el pago antes de borrarla';
  END IF;

  -- Sin precio es una marca mal puesta y la puede deshacer quien la puso. Con
  -- precio hay un cobro en camino, y borrarlo sin que el admin se entere le
  -- descuadraría lo que tenía por cobrar.
  IF v_monto IS NOT NULL AND v_rol = 'profesor' THEN
    RAISE EXCEPTION 'Esa clase ya tiene precio: pedile a un administrador que la borre';
  END IF;

  DELETE FROM clases_extraordinarias WHERE id = p_id;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Las dos primeras deben decir `false` en acepta_profesor; la de borrar `true`,
-- porque el profesor sigue pudiendo deshacer una marca sin precio.
SELECT p.proname AS funcion,
       pg_get_functiondef(p.oid) LIKE '%''profesor''%' AS acepta_profesor
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('asignar_monto_clase_extraordinaria',
                    'enviar_clases_extra_a_cobro',
                    'eliminar_clase_extraordinaria')
ORDER BY p.proname;
