BEGIN;
SELECT _migracion_nueva('171_cuota_asesor_tecnico_ia');

-- Auditoría de consultas al asesor técnico IA (no guarda la respuesta completa
-- para no inflar la base; sí guarda pregunta, jugador y longitud).
CREATE TABLE tecnico_asesor_consultas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  usuario_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jugador_id      uuid REFERENCES jugadores(id) ON DELETE SET NULL,
  pregunta        text NOT NULL,
  respuesta_chars integer NOT NULL DEFAULT 0,
  modelo          text NOT NULL DEFAULT 'gpt-4o-mini',
  creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tecnico_asesor_consultas_club_fecha_idx
  ON tecnico_asesor_consultas (club_id, creado_en DESC);
CREATE INDEX tecnico_asesor_consultas_usuario_fecha_idx
  ON tecnico_asesor_consultas (usuario_id, creado_en DESC);

ALTER TABLE tecnico_asesor_consultas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tecnico_asesor_consultas_staff ON tecnico_asesor_consultas
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );

CREATE POLICY tecnico_asesor_consultas_propia ON tecnico_asesor_consultas
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND usuario_id = auth.uid()
  );

-- Inserts solo vía service role / RPC; el cliente no escribe directo.
REVOKE INSERT, UPDATE, DELETE ON tecnico_asesor_consultas FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consumir_cuota_asesor_tecnico()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = v_uid
      AND p.club_id IS NOT NULL
      AND p.rol IN ('admin', 'profesor', 'superadmin', 'jugador')
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- 5 consultas / 5 min y 30 / día por usuario.
  IF NOT public._consumir_limite_publico('asesor-tecnico-corto', v_uid::text, 5, 300)
     OR NOT public._consumir_limite_publico('asesor-tecnico-diario', v_uid::text, 30, 86400) THEN
    RAISE EXCEPTION 'Límite de consultas al asesor técnico alcanzado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_cuota_asesor_tecnico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_cuota_asesor_tecnico() TO authenticated;

COMMENT ON TABLE tecnico_asesor_consultas IS
  'Registro de uso del asesor técnico IA por club/usuario/jugador.';
COMMENT ON FUNCTION public.consumir_cuota_asesor_tecnico() IS
  'Consume cuota del asesor técnico IA (corto y diario) para el usuario autenticado.';

COMMIT;
