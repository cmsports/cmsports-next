-- Propaga a las sesiones abiertas los cambios que deben cruzar roles.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clases;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluaciones_trimestrales;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
