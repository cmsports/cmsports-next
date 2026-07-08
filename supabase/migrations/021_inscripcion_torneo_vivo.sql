-- ============================================================
-- CmSports — Inscripción desde la vista en vivo (sin cuenta)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--   3. Se puede correr de nuevo sin riesgo (idempotente)
--
-- Qué agrega:
--   1. Columna solicitudes_jugador.pago ('pagado' | 'pendiente') —
--      la marca que deja el jugador al inscribirse desde /vivo.
--   2. solicitar_inscripcion_torneo(codigo, nombre, rut, pago) —
--      un jugador que no aparece en la lista deja nombre + RUT +
--      estado de pago. Crea una solicitud_jugador 'pendiente' que
--      el club ve en la campanita y en /solicitudes. Sin correo.
--      SECURITY DEFINER: no expone tablas al rol anon.
-- ============================================================

ALTER TABLE solicitudes_jugador ADD COLUMN IF NOT EXISTS pago text;

CREATE OR REPLACE FUNCTION public.solicitar_inscripcion_torneo(
  p_codigo text, p_nombre text, p_rut text, p_pago text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_id uuid;
BEGIN
  SELECT club_id INTO v_club FROM torneos WHERE codigo = upper(p_codigo) LIMIT 1;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  INSERT INTO solicitudes_jugador (club_id, nombre, rut, pago, estado)
  VALUES (
    v_club,
    COALESCE(NULLIF(trim(p_nombre), ''), 'Sin nombre'),
    NULLIF(trim(p_rut), ''),
    CASE WHEN p_pago = 'pagado' THEN 'pagado' ELSE 'pendiente' END,
    'pendiente'
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'solicitud_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text, text, text) TO anon, authenticated;

-- ============================================================
-- DONE 🏓  Las inscripciones desde /vivo llegan a la campanita
--          (admin/profesor) y a /solicitudes como 'pendiente'.
-- ============================================================
