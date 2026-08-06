-- El superadmin no podía ver jugadores de ningún club salvo el que tuviera
-- asignado en su propio perfil en ese momento.
--
-- La migración 096 le dio a `clubes` la regla "cada uno el suyo; el
-- superadmin, todos", pero a `jugadores` nunca se le aplicó lo mismo. El
-- panel de superadmin cuenta jugadores por club consultando la tabla
-- directamente desde el navegador (layout.tsx de /superadmin), así que quedó
-- atado a esa misma regla: solo veía el club que "Gestionar" le hubiera
-- asignado por última vez, y mostraba 0 en todos los demás.
--
-- Efecto real: Buin mostraba 0 jugadores en el listado de superadmin (tenía
-- decenas), y el club Paine no se podía eliminar porque el conteo mostraba 0
-- mientras la base sí tenía jugadores reales — el error de llave foránea
-- estaba protegiendo correctamente, el conteo era el que mentía.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('131_superadmin_ve_jugadores');

DROP POLICY IF EXISTS "jugadores_select" ON public.jugadores;
CREATE POLICY "jugadores_select" ON public.jugadores
  FOR SELECT
  USING (
    public.get_my_rol() = 'superadmin'
    OR (
      club_id = public.get_my_club_id()
      AND (
        public.get_my_rol() IN ('admin', 'profesor')
        OR (
          public.get_my_rol() = 'jugador'
          AND id = public.get_my_jugador_id()
        )
      )
    )
  );

COMMENT ON POLICY "jugadores_select" ON public.jugadores IS
  'Staff lee jugadores de su club; cada jugador solo su propia ficha; superadmin lee todos (mismo patrón que clubes_lectura, migración 096).';

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT polname, pg_get_expr(polqual, polrelid) AS regla
FROM pg_policy WHERE polrelid = 'public.jugadores'::regclass AND polname = 'jugadores_select';
