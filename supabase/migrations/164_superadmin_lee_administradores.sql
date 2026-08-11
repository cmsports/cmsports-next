-- Permite al superadmin ver los administradores asociados a todos los clubes.
-- Antes la política solo permitía leer el propio perfil o perfiles del mismo
-- club; como el superadmin normalmente no tiene club_id, la consulta del panel
-- devolvía cero administradores.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('164_superadmin_lee_administradores');

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfiles_lectura_propia_o_club" ON public.perfiles;
CREATE POLICY "perfiles_lectura_propia_o_club" ON public.perfiles
  FOR SELECT USING (
    id = auth.uid()
    OR club_id = public.get_my_club_id()
    OR public.get_my_rol() = 'superadmin'
  );

COMMIT;
