-- ============================================================
-- CmSports — Aviso desde la vista en vivo (sin cuenta)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--   3. Se puede correr de nuevo sin riesgo (idempotente)
--
-- Qué hace:
--   solicitar_inscripcion_torneo(codigo, nombre) —
--     un jugador que no aparece en la lista deja SOLO su nombre.
--     Crea una solicitud_jugador 'pendiente' que el club ve en la
--     campanita y en /solicitudes. El club confirma la inscripción y
--     reingresa al jugador con su RUT y pago. Sin correo.
--     SECURITY DEFINER: no expone tablas al rol anon.
--
-- Nota: la columna solicitudes_jugador.pago (versión anterior de esta
-- feature) queda sin uso; no se elimina para no tocar el esquema.
-- ============================================================

-- Versión anterior pedía RUT y pago al jugador (malentendido). Se reemplaza.
DROP FUNCTION IF EXISTS public.solicitar_inscripcion_torneo(text, text, text, text);

CREATE OR REPLACE FUNCTION public.solicitar_inscripcion_torneo(
  p_codigo text, p_nombre text
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

  INSERT INTO solicitudes_jugador (club_id, nombre, estado)
  VALUES (
    v_club,
    COALESCE(NULLIF(trim(p_nombre), ''), 'Sin nombre'),
    'pendiente'
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'solicitud_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text) TO anon, authenticated;

-- ============================================================
-- DONE 🏓  Los avisos desde /vivo llegan a la campanita
--          (admin/profesor) y a /solicitudes como 'pendiente'.
-- ============================================================
