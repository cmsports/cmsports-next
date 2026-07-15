-- El jugador solo puede leer su ficha. Admin y profesor pueden leer las fichas
-- del club para administrar o evaluar, respectivamente.
DROP POLICY IF EXISTS "jugadores_select" ON jugadores;
CREATE POLICY "jugadores_select" ON jugadores
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'profesor')
      OR id = get_my_jugador_id()
    )
  );

-- Feedback entre profesor/admin y jugador.
-- La confirmación es una operación estrecha: el jugador solo puede cambiar
-- firmado_alumno en una evaluación que le pertenezca.

CREATE OR REPLACE FUNCTION public.confirmar_feedback_jugador(p_evaluacion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil perfiles%ROWTYPE;
  v_actualizadas integer;
BEGIN
  SELECT * INTO v_perfil
  FROM perfiles
  WHERE id = auth.uid();

  IF v_perfil.id IS NULL
     OR v_perfil.rol <> 'jugador'
     OR v_perfil.jugador_id IS NULL
     OR v_perfil.club_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  UPDATE evaluaciones_trimestrales
  SET firmado_alumno = true
  WHERE id = p_evaluacion_id
    AND jugador_id = v_perfil.jugador_id
    AND club_id = v_perfil.club_id;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  IF v_actualizadas <> 1 THEN
    RAISE EXCEPTION 'Evaluación no encontrada';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_feedback_jugador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_feedback_jugador(uuid) TO authenticated;
