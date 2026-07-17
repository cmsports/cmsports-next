-- Aislamiento definitivo de fichas de jugadores.
-- Admin/profesor leen el plantel del club; jugador solo su propia ficha.

ALTER TABLE public.jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jugadores_select" ON public.jugadores;
CREATE POLICY "jugadores_select" ON public.jugadores
  FOR SELECT
  USING (
    club_id = public.get_my_club_id()
    AND (
      public.get_my_rol() IN ('admin', 'profesor')
      OR (
        public.get_my_rol() = 'jugador'
        AND id = public.get_my_jugador_id()
      )
    )
  );

COMMENT ON POLICY "jugadores_select" ON public.jugadores IS
  'Staff lee jugadores de su club; cada jugador solo puede leer su propia ficha.';

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jugadores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mensualidades;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneos_externos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
