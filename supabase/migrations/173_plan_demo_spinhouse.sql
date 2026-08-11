-- Plan demo de entrenamiento para el piloto Spinhouse:
-- un plan activo, 4 ejercicios ligados a objetivos de la 146,
-- y asignación a Matías y Valentina.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Alcance: solo Spinhouse.

BEGIN;
SELECT _migracion_nueva('173_plan_demo_spinhouse');

DO $$
DECLARE
  v_club uuid := '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
  v_plan uuid := 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
  v_ej1  uuid := 'b2c3d4e5-f6a7-4890-b123-456789abcdef';
  v_ej2  uuid := 'c3d4e5f6-a7b8-4901-c234-56789abcdef0';
  v_ej3  uuid := 'd4e5f6a7-b8c9-4012-d345-6789abcdef01';
  v_ej4  uuid := 'e5f6a7b8-c9d0-4123-e456-789abcdef012';
  v_matias uuid := '7f3a4c19-2d6b-4e81-9a52-6c8f1b7d3e40';
  v_valen  uuid := '1c6e8a42-9b3d-4f70-a521-7d4c2e8b6f19';
  v_ser uuid;
  v_der uuid;
  v_rev uuid;
  v_desp uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT id INTO v_ser FROM tecnico_objetivos
  WHERE club_id = v_club AND codigo = 'SER-CONTROL';
  SELECT id INTO v_der FROM tecnico_objetivos
  WHERE club_id = v_club AND codigo = 'DER-CONS';
  SELECT id INTO v_rev FROM tecnico_objetivos
  WHERE club_id = v_club AND codigo = 'REV-CONS';
  SELECT id INTO v_desp FROM tecnico_objetivos
  WHERE club_id = v_club AND codigo = 'DESP-REC';

  IF v_ser IS NULL OR v_der IS NULL OR v_rev IS NULL OR v_desp IS NULL THEN
    RAISE EXCEPTION 'Faltan objetivos técnicos de la migración 146 en Spinhouse';
  END IF;

  INSERT INTO tecnico_planes (
    id, club_id, nombre, descripcion, nivel, objetivo_general, duracion_min, activo
  ) VALUES (
    v_plan,
    v_club,
    'Base técnica inicial',
    'Plan demo del piloto: control de servicio, regularidad de derecho/revés y recuperación de posición.',
    'inicial',
    'Construir consistencia básica y hábitos de posición antes de avanzar a táctica de ataque.',
    60,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tecnico_plan_ejercicios (
    id, club_id, plan_id, objetivo_id, orden, nombre, descripcion,
    duracion_min, repeticiones, dificultad, criterio_exito
  ) VALUES
  (
    v_ej1, v_club, v_plan, v_ser, 1,
    'Servicio a zona corta',
    '10 series de servicio corto hacia zona 1 o 3, con foco en altura y profundidad.',
    12, 10, 'baja',
    '7 de 10 servicios caen en la zona objetivo sin rebote alto.'
  ),
  (
    v_ej2, v_club, v_plan, v_der, 2,
    'Peloteo de derecho cruzado',
    'Peloteo continuo de derecho cruzado manteniendo ritmo y altura controlada.',
    15, 8, 'media',
    'Completa 8 golpes válidos consecutivos sin error forzado.'
  ),
  (
    v_ej3, v_club, v_plan, v_rev, 3,
    'Peloteo de revés paralelo',
    'Peloteo de revés paralelo con recuperación al centro después de cada golpe.',
    15, 8, 'media',
    'Completa 8 golpes válidos consecutivos con dirección estable.'
  ),
  (
    v_ej4, v_club, v_plan, v_desp, 4,
    'Recuperación al centro',
    'Secuencias de dos golpes laterales y vuelta inmediata a posición preparada.',
    10, 10, 'media',
    'Recupera la posición preparada en 8 de 10 secuencias observadas.'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tecnico_plan_jugadores (
    club_id, plan_id, jugador_id, estado, fecha_inicio, notas
  )
  SELECT v_club, v_plan, j.id, 'asignado', v_hoy, 'Asignación demo del piloto'
  FROM (VALUES (v_matias), (v_valen)) AS j(id)
  WHERE EXISTS (
    SELECT 1 FROM jugadores
    WHERE id = j.id AND club_id = v_club
  )
  AND NOT EXISTS (
    SELECT 1 FROM tecnico_plan_jugadores tpj
    WHERE tpj.plan_id = v_plan
      AND tpj.jugador_id = j.id
      AND tpj.estado <> 'archivado'
  );
END $$;

COMMIT;
