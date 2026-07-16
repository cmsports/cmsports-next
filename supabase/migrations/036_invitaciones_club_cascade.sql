ALTER TABLE public.invitaciones
  DROP CONSTRAINT IF EXISTS invitaciones_club_id_fkey;

ALTER TABLE public.invitaciones
  ADD CONSTRAINT invitaciones_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubes(id) ON DELETE CASCADE;
