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

-- Se registra como '130_...' y no como '131_...' a propósito: esta migración
-- ya corrió, el 2026-08-06, cuando el archivo se llamaba 130. Después se lo
-- renumeró a 131 porque el 130 ya lo ocupaba `130_notas_superadmin`, pero en
-- `_migraciones_aplicadas` quedó el nombre viejo.
--
-- Con '131_...' el portazo no encontraba nada registrado y dejaba pasar: el
-- archivo se podía volver a ejecutar entero. Acá no era grave —es DROP POLICY
-- IF EXISTS + CREATE POLICY, idempotente— pero el portazo que no protege es
-- peor que no tenerlo, porque se lee como si protegiera.
SELECT _migracion_nueva('130_superadmin_ve_jugadores');

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
