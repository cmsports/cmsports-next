-- Limpia fichas es_externo del club piloto Spinhouse que quedaron de un
-- torneo externo. Conserva los dos jugadores demo del módulo técnico.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Antes: solo Spinhouse. No toca Buin ni otros clubes.

BEGIN;
SELECT _migracion_nueva('172_limpiar_externos_spinhouse');

DO $$
DECLARE
  v_club uuid := '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
  v_demo_1 uuid := '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40'; -- Matías
  v_demo_2 uuid := '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19'; -- Valentina
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM jugadores
  WHERE club_id = v_club
    AND es_externo IS TRUE
    AND id NOT IN (v_demo_1, v_demo_2);

  RAISE NOTICE 'Externos Spinhouse a limpiar: %', v_count;
END $$;

-- Respaldo con nombre único (sin IF NOT EXISTS: si se re-ejecuta, aborta).
CREATE TABLE _respaldo_externos_spinhouse_151_20260809 AS
SELECT *
FROM jugadores
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND es_externo IS TRUE
  AND id NOT IN (
    '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
    '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19'
  );

-- Snapshot de nombres en inscripciones / partidos / pagos / podio antes de borrar.
UPDATE grupo_jugadores gj
SET nombre = COALESCE(gj.nombre, j.nombre),
    jugador_id = NULL
FROM jugadores j
WHERE gj.jugador_id = j.id
  AND j.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND j.es_externo IS TRUE
  AND j.id NOT IN (
    '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
    '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19'
  );

UPDATE torneo_partidos p
SET nombre_a = COALESCE(p.nombre_a, ja.nombre)
FROM jugadores ja
WHERE p.jugador_a = ja.id
  AND ja.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND ja.es_externo IS TRUE;

UPDATE torneo_partidos p
SET nombre_b = COALESCE(p.nombre_b, jb.nombre)
FROM jugadores jb
WHERE p.jugador_b = jb.id
  AND jb.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND jb.es_externo IS TRUE;

UPDATE torneo_partidos p
SET nombre_ganador = COALESCE(p.nombre_ganador, jg.nombre)
FROM jugadores jg
WHERE p.ganador = jg.id
  AND jg.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND jg.es_externo IS TRUE;

UPDATE torneo_pagos tp
SET jugador_nombre = COALESCE(tp.jugador_nombre, j.nombre),
    jugador_id = NULL
FROM jugadores j
WHERE tp.jugador_id = j.id
  AND j.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND j.es_externo IS TRUE
  AND j.id NOT IN (
    '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
    '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19'
  );

UPDATE torneos t
SET campeon_nombre = COALESCE(t.campeon_nombre, j.nombre)
FROM jugadores j
WHERE t.campeon_id = j.id
  AND j.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND j.es_externo IS TRUE;

UPDATE torneos t
SET subcampeon_nombre = COALESCE(t.subcampeon_nombre, j.nombre)
FROM jugadores j
WHERE t.subcampeon_id = j.id
  AND j.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND j.es_externo IS TRUE;

-- Dependencias técnicas (si algún externo llegó a tener sesión).
DELETE FROM tecnico_evaluacion_items
WHERE evaluacion_id IN (
  SELECT e.id FROM tecnico_evaluaciones e
  JOIN jugadores j ON j.id = e.jugador_id
  WHERE j.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND j.es_externo IS TRUE
);

DELETE FROM tecnico_evaluaciones
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DELETE FROM tecnico_eventos
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DELETE FROM tecnico_videos
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DELETE FROM tecnico_sesiones
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DELETE FROM tecnico_plan_jugadores
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DELETE FROM tecnico_jugador_objetivos
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

-- Tabla de la migración 150; si aún no se aplicó, se omite.
DO $$
BEGIN
  IF to_regclass('public.tecnico_asesor_consultas') IS NOT NULL THEN
    DELETE FROM tecnico_asesor_consultas
    WHERE jugador_id IN (
      SELECT id FROM jugadores
      WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
        AND es_externo IS TRUE
    );
  END IF;
END $$;

-- Otras dependencias comunes de externos (solo si la tabla existe).
UPDATE perfiles SET jugador_id = NULL
WHERE jugador_id IN (
  SELECT id FROM jugadores
  WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
    AND es_externo IS TRUE
);

DO $$
BEGIN
  IF to_regclass('public.torneo_felicitaciones') IS NOT NULL THEN
    DELETE FROM torneo_felicitaciones
    WHERE jugador_id IN (
      SELECT id FROM jugadores
      WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
        AND es_externo IS TRUE
    );
  END IF;

  IF to_regclass('public.torneo_cabezas_serie') IS NOT NULL THEN
    DELETE FROM torneo_cabezas_serie
    WHERE jugador_id IN (
      SELECT id FROM jugadores
      WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
        AND es_externo IS TRUE
    );
  END IF;

  IF to_regclass('public.asistencia') IS NOT NULL THEN
    DELETE FROM asistencia
    WHERE jugador_id IN (
      SELECT id FROM jugadores
      WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
        AND es_externo IS TRUE
    );
  END IF;
  -- clase_jugadores ya no existe (migración 111).
END $$;

-- Borrado final: solo externos de Spinhouse (nunca los demos).
DELETE FROM jugadores
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND es_externo IS TRUE
  AND id NOT IN (
    '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40',
    '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19'
  );

COMMIT;
