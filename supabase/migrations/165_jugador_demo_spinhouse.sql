-- Jugador ficticio para probar el módulo técnico de Spinhouse.
-- No crea cuenta de acceso: solo sirve como ficha de prueba para videos,
-- sesiones y evaluaciones.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('165_jugador_demo_spinhouse');

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
  '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
  '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
  'Matías Rojas (Demo)',
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
