-- club_photos quedaba abierta entre clubes: su regla de lectura era
-- "cualquier usuario logueado", sin filtrar por club en absoluto.
--
-- Encontrada en la auditoría de aislamiento entre clubes pedida tras el
-- incidente de la migración 089. A diferencia de jugadores/movimientos/etc.,
-- esta tabla no tiene una relación limpia con clubes: guarda `club_slug`
-- (texto libre) en vez de un club_id con llave foránea, y `clubes` no tiene
-- ninguna columna `slug` con la que cruzarlo.
--
-- Tampoco se usa: no hay una sola referencia a `club_photos` en el código de
-- la aplicación (se buscó en src/app y src/components). Es una tabla huérfana
-- de un diseño anterior — `fotos_galeria` es la que quedó vigente, con
-- club_id de verdad y bien filtrada.
--
-- Como nada la lee ni la escribe legítimamente, se cierra del todo en vez de
-- intentar reconstruirle un filtro por club que el esquema actual no soporta
-- limpiamente. Si en el futuro hace falta reactivarla, se le agrega primero
-- una columna club_id real con su propia migración.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('133_cerrar_club_photos_huerfana');

DROP POLICY IF EXISTS club_photos_select ON public.club_photos;
DROP POLICY IF EXISTS club_photos_admin_all ON public.club_photos;

CREATE POLICY club_photos_cerrada ON public.club_photos
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.club_photos IS
  'Huérfana, sin uso en la app (club_slug sin relación real a clubes). Cerrada por completo desde la migración 133. Si se reactiva, agregar antes una columna club_id de verdad.';

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'club_photos';
