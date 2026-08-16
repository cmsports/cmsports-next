-- Club del juez (Coydán / MET2 Costa). Solo torneo oficial + marcador técnico.
-- NO toca Buin. La cuenta admin se crea en Superadmin (no hay passwords acá).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('194_club_juez_met2');

INSERT INTO clubes (
  id,
  nombre,
  ciudad,
  deporte,
  plan_mensual,
  estado_pago,
  estado_plan,
  modulos_habilitados
)
VALUES (
  '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430',
  'Juez MET2 Costa',
  'Santiago',
  'Tenis de mesa',
  0,
  'pendiente',
  'prueba',
  ARRAY['torneo_oficial', 'tecnico']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  modulos_habilitados = EXCLUDED.modulos_habilitados;

COMMIT;

-- Después: Superadmin → crear administrador del club
--   7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430
-- o Authentication > Users +:
--
-- INSERT INTO public.perfiles (id, club_id, nombre, email, rol, jugador_id)
-- VALUES (
--   '<UUID_DEL_USUARIO_AUTH>',
--   '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430',
--   'Juez General',
--   'juez@cmsports.cl',
--   'admin',
--   NULL
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   club_id = EXCLUDED.club_id,
--   nombre = EXCLUDED.nombre,
--   email = EXCLUDED.email,
--   rol = EXCLUDED.rol,
--   jugador_id = NULL;
