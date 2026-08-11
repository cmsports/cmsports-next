-- Segundo jugador ficticio para probar el comparador cara a cara.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('169_segundo_jugador_demo_spinhouse');

INSERT INTO jugadores (
  id,
  club_id,
  nombre,
  categoria,
  estado,
  es_externo,
  sesiones_usadas,
  sesiones_limite,
  tipo_plan,
  entrenamientos_por_semana,
  mensualidad
)
VALUES (
  '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19',
  '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
  'Valentina Soto (Demo)',
  'juvenil',
  'activo',
  false,
  0,
  0,
  'mensual',
  0,
  NULL
);

COMMIT;
