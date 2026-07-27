-- Cierra seis tablas que se leían sin iniciar sesión.
--
-- La llave anónima viaja dentro del navegador —es pública por diseño— así que
-- cualquiera que abra las herramientas de desarrollo podía consultar:
--
--   perfiles                   nombre, correo y rol de todos los usuarios de
--                              los cuatro clubes de la base
--   invitaciones               los códigos activos: con uno cualquiera se
--                              inscribe en cualquier club
--   evaluaciones_trimestrales  las notas que los profesores ponen a sus
--                              jugadores, la mayoría menores de edad
--   grupo_jugadores            resultados de los grupos de torneo
--   torneos_externos           en qué torneos participó cada jugador
--   clubes                     los clubes con su plan de pago
--
-- Ninguna necesitaba ser pública. `/registro` valida el código con la función
-- `validar_invitacion`, que no lee la tabla, y `/login` consulta el perfil
-- recién después de autenticarse.
--
-- get_my_club_id() es SECURITY DEFINER, así que no se recursiona al usarla
-- dentro de una política sobre la misma tabla que consulta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ perfiles ══════════════════════════════════════════════════════════════
-- El propio, o los del mismo club. El staff necesita ver a los suyos.
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfiles_lectura_propia_o_club" ON public.perfiles;
CREATE POLICY "perfiles_lectura_propia_o_club" ON public.perfiles
  FOR SELECT USING (id = auth.uid() OR club_id = public.get_my_club_id());

DROP POLICY IF EXISTS "perfiles_actualiza_propio" ON public.perfiles;
CREATE POLICY "perfiles_actualiza_propio" ON public.perfiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());


-- ══ invitaciones ══════════════════════════════════════════════════════════
-- Solo el staff del club dueño del código. El registro no la lee: usa
-- validar_invitacion, que es SECURITY DEFINER.
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitaciones_staff" ON public.invitaciones;
CREATE POLICY "invitaciones_staff" ON public.invitaciones
  FOR ALL USING (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'))
  WITH CHECK (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin'));


-- ══ evaluaciones_trimestrales ═════════════════════════════════════════════
-- El jugador ve las suyas; el staff, las de su club.
ALTER TABLE public.evaluaciones_trimestrales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluaciones_lectura" ON public.evaluaciones_trimestrales;
CREATE POLICY "evaluaciones_lectura" ON public.evaluaciones_trimestrales
  FOR SELECT USING (
    club_id = public.get_my_club_id()
    AND (public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
         OR jugador_id = public.get_my_jugador_id())
  );

DROP POLICY IF EXISTS "evaluaciones_gestion_staff" ON public.evaluaciones_trimestrales;
CREATE POLICY "evaluaciones_gestion_staff" ON public.evaluaciones_trimestrales
  FOR ALL USING (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = public.get_my_club_id() AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor'));


-- ══ torneos_externos ══════════════════════════════════════════════════════
ALTER TABLE public.torneos_externos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneos_externos_club" ON public.torneos_externos;
CREATE POLICY "torneos_externos_club" ON public.torneos_externos
  FOR ALL USING (club_id = public.get_my_club_id())
  WITH CHECK (club_id = public.get_my_club_id());


-- ══ grupo_jugadores ═══════════════════════════════════════════════════════
-- No tiene club propio: cuelga del torneo, que sí lo tiene.
ALTER TABLE public.grupo_jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_jugadores_club" ON public.grupo_jugadores;
CREATE POLICY "grupo_jugadores_club" ON public.grupo_jugadores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.torneo_grupos g
      JOIN public.torneos t ON t.id = g.torneo_id
      WHERE g.id = grupo_id AND t.club_id = public.get_my_club_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torneo_grupos g
      JOIN public.torneos t ON t.id = g.torneo_id
      WHERE g.id = grupo_id AND t.club_id = public.get_my_club_id()
    )
  );


-- ══ clubes ════════════════════════════════════════════════════════════════
-- Cada uno ve el suyo. El superadmin los ve todos.
ALTER TABLE public.clubes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clubes_lectura_propio" ON public.clubes;
CREATE POLICY "clubes_lectura_propio" ON public.clubes
  FOR SELECT USING (id = public.get_my_club_id() OR public.get_my_rol() = 'superadmin');

DROP POLICY IF EXISTS "clubes_gestion" ON public.clubes;
CREATE POLICY "clubes_gestion" ON public.clubes
  FOR ALL USING (
    (id = public.get_my_club_id() AND public.get_my_rol() = 'admin')
    OR public.get_my_rol() = 'superadmin'
  )
  WITH CHECK (
    (id = public.get_my_club_id() AND public.get_my_rol() = 'admin')
    OR public.get_my_rol() = 'superadmin'
  );

COMMIT;


-- ── Verificación: ninguna debe quedar sin protección ──────────────────────
SELECT c.relname AS tabla,
       CASE WHEN c.relrowsecurity THEN 'protegida' ELSE 'ABIERTA' END AS estado,
       count(p.policyname)                                            AS politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE n.nspname = 'public'
  AND c.relname IN ('perfiles', 'invitaciones', 'evaluaciones_trimestrales',
                    'grupo_jugadores', 'torneos_externos', 'clubes')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
