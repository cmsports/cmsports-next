-- Cierra de verdad las seis tablas que la 095 no alcanzó a cerrar.
--
-- La 095 agregó políticas restrictivas, pero las tablas siguieron devolviendo
-- datos sin sesión. El motivo: en PostgreSQL las políticas se suman con "o".
-- Alcanza con que una sola permita para que el acceso pase, y quedaban viejas
-- que permitían todo. La más clara:
--
--   CREATE POLICY "invitaciones_select_public" ON invitaciones
--     FOR SELECT USING (true);
--
-- Buscarlas una por una entre noventa y cinco migraciones es frágil, así que
-- acá se borran todas las políticas de esas seis tablas y se dejan solo las
-- que corresponden. Es lo único que garantiza que no quede ninguna suelta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. Borrar todo lo que haya ════════════════════════════════════════════
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('perfiles', 'invitaciones', 'evaluaciones_trimestrales',
                        'grupo_jugadores', 'torneos_externos', 'clubes')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ══ 2. Dejar solo las correctas ═══════════════════════════════════════════

-- perfiles: el propio, o los del mismo club. El staff necesita ver a los suyos.
-- Las altas las hace el servidor con la llave de servicio, que se salta esto.
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfiles_lectura" ON public.perfiles
  FOR SELECT USING (id = auth.uid() OR club_id = public.get_my_club_id());

CREATE POLICY "perfiles_actualiza_propio" ON public.perfiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "perfiles_gestion_admin" ON public.perfiles
  FOR ALL USING (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'))
  WITH CHECK (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'));


-- invitaciones: solo el staff dueño del código. El registro no la lee: usa
-- validar_invitacion, que es SECURITY DEFINER y se salta las políticas.
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitaciones_staff" ON public.invitaciones
  FOR ALL USING (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'))
  WITH CHECK (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'));


-- evaluaciones: el jugador ve las suyas, el staff las de su club.
ALTER TABLE public.evaluaciones_trimestrales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluaciones_lectura" ON public.evaluaciones_trimestrales
  FOR SELECT USING (
    club_id = public.get_my_club_id()
    AND (public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
         OR jugador_id = public.get_my_jugador_id())
  );

CREATE POLICY "evaluaciones_gestion_staff" ON public.evaluaciones_trimestrales
  FOR ALL USING (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor'));


-- torneos_externos
ALTER TABLE public.torneos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "torneos_externos_club" ON public.torneos_externos
  FOR ALL USING (club_id = public.get_my_club_id())
  WITH CHECK (club_id = public.get_my_club_id());


-- grupo_jugadores: no tiene club propio, cuelga del torneo.
ALTER TABLE public.grupo_jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grupo_jugadores_club" ON public.grupo_jugadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.torneo_grupos g JOIN public.torneos t ON t.id = g.torneo_id
            WHERE g.id = grupo_id AND t.club_id = public.get_my_club_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.torneo_grupos g JOIN public.torneos t ON t.id = g.torneo_id
            WHERE g.id = grupo_id AND t.club_id = public.get_my_club_id())
  );


-- clubes: cada uno el suyo; el superadmin, todos.
ALTER TABLE public.clubes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clubes_lectura" ON public.clubes
  FOR SELECT USING (id = public.get_my_club_id() OR public.get_my_rol() = 'superadmin');

CREATE POLICY "clubes_gestion" ON public.clubes
  FOR ALL USING (
    (id = public.get_my_club_id() AND public.get_my_rol() = 'admin') OR public.get_my_rol() = 'superadmin')
  WITH CHECK (
    (id = public.get_my_club_id() AND public.get_my_rol() = 'admin') OR public.get_my_rol() = 'superadmin');

COMMIT;


-- ── Verificación: ninguna política puede permitir todo ────────────────────
SELECT tablename, policyname,
       CASE WHEN qual = 'true' THEN 'PERMITE TODO' ELSE 'restringida' END AS estado
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('perfiles', 'invitaciones', 'evaluaciones_trimestrales',
                    'grupo_jugadores', 'torneos_externos', 'clubes')
ORDER BY tablename, policyname;
