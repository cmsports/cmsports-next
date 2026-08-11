-- Club piloto para desarrollar y probar el módulo técnico.
--
-- La cuenta administradora NO se crea acá: las contraseñas no deben quedar
-- escritas en migraciones ni en el repositorio. Después de ejecutar esta
-- migración, crea el usuario en Supabase Auth y ejecuta el SQL de vinculación
-- indicado al final de este archivo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('163_club_spinhouse_demo');

INSERT INTO clubes (
  id,
  nombre,
  ciudad,
  deporte,
  plan_mensual,
  estado_pago,
  modulos_habilitados
)
VALUES (
  '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
  'Spinhouse',
  'Santiago',
  'Tenis de mesa',
  0,
  'pendiente',
  ARRAY[
    'torneos',
    'liga',
    'clases',
    'calendario',
    'asistencia',
    'mensualidades',
    'finanzas',
    'tienda',
    'feedback',
    'tecnico'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Si la versión anterior de la migración 141 ya se ejecutó, corrige su
-- habilitación experimental en Buin: este módulo queda solo en Spinhouse.
UPDATE clubes
SET modulos_habilitados = array_remove(
  COALESCE(modulos_habilitados, ARRAY[]::text[]), 'tecnico'
)
WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

COMMIT;

-- Después de crear el usuario en Authentication > Users, reemplaza
-- <UUID_DEL_USUARIO_AUTH> por el UUID real y ejecuta:
--
-- INSERT INTO public.perfiles (id, club_id, nombre, email, rol, jugador_id)
-- VALUES (
--   '<UUID_DEL_USUARIO_AUTH>',
--   '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
--   'Administrador Spinhouse',
--   'spinhouse@cmsports.cl',
--   'admin',
--   NULL
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   club_id = EXCLUDED.club_id,
--   nombre = EXCLUDED.nombre,
--   email = EXCLUDED.email,
--   rol = EXCLUDED.rol,
--   jugador_id = NULL;
