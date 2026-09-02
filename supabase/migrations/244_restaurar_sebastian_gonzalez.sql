-- ────────────────────────────────────────────────────────────
-- Restaura la ficha de Sebastián Alonso González González, borrada sin
-- dejar rastro (`eliminar_jugador_atomico` no audita — ver conversación del
-- 2026-09-01).
--
-- Este cambio afecta a: Asociación TDM Buin y Paine.
--
-- ── De dónde sale cada dato ────────────────────────────────────────────────
-- `eliminar_jugador_atomico` borra la fila de `jugadores`, pero NUNCA toca
-- `solicitudes_jugador` — y la suya (id 7920973e-44af-42e0-9022-e89cdcd69cad,
-- estado 'aprobado') seguía intacta con todos sus datos personales reales:
-- nombre, RUT, contacto, fecha de nacimiento, alergias, tallas. Nada de lo
-- que sigue abajo es inventado.
--
-- Su matrícula ($20.000, pagada el 2026-08-29) tampoco se perdió: quedó en
-- `movimientos` con `jugador_id = NULL` (movimiento id
-- a326a609-0f91-43d9-9beb-8f2d4a9747e6) porque `eliminar_jugador_atomico`
-- desvincula en vez de borrar los movimientos, a propósito, para no perder
-- plata real (migración 127). Esta migración le devuelve el vínculo.
--
-- ── Lo que NO se puede recuperar ───────────────────────────────────────────
-- `solicitudes_jugador` no guarda categoría, plan, mensualidad, sesiones ni a
-- qué bloques quedó inscrito: eso lo decide el admin al aprobar y solo vivía
-- en la fila de `jugadores` que se borró. Queda:
--   · categoria, tipo_plan, mensualidad, sesiones_limite → NULL. La pantalla
--     ya sabe mostrar "Cuota por asignar" en vez de inventar un monto.
--   · Sin ningún bloque asignado — no va a aparecer en ningún horario hasta
--     que alguien lo inscriba desde Horario semanal o su propia ficha.
--   · Sin cuenta de acceso (se borró junto con `perfiles`). Una vez aplicada
--     esta migración, usar "Crear acceso" desde su ficha para darle login de
--     nuevo — es la función `crearAccesoJugador` que ya existe.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('244_restaurar_sebastian_gonzalez');

DO $$
DECLARE
  v_club_id       uuid := 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
  v_solicitud_id  uuid := '7920973e-44af-42e0-9022-e89cdcd69cad';
  v_movimiento_id uuid := 'a326a609-0f91-43d9-9beb-8f2d4a9747e6';
  v_sol           record;
  v_jugador_id    uuid;
BEGIN
  SELECT * INTO v_sol FROM solicitudes_jugador
  WHERE id = v_solicitud_id AND club_id = v_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud % ya no existe o cambió de club — revisar a mano antes de seguir', v_solicitud_id;
  END IF;

  -- Si ya hay una ficha con este RUT (alguien lo restauró a mano, o nunca se
  -- borró de verdad), no se crea una segunda — se avisa y no se hace nada más.
  IF EXISTS (SELECT 1 FROM jugadores WHERE club_id = v_club_id AND rut = v_sol.rut) THEN
    RAISE EXCEPTION 'Ya existe un jugador con RUT % en este club — no se crea una ficha duplicada. Revisar a mano.', v_sol.rut;
  END IF;

  INSERT INTO jugadores (
    club_id, nombre, rut, email, telefono, fecha_nacimiento, direccion, comuna,
    contacto_emergencia_nombre, contacto_emergencia_telefono, indicaciones_medicas,
    nombres, apellido1, apellido2, apellido3, talla_polera, talla_short,
    estado, es_externo, sesiones_usadas,
    matricula_pagada, matricula_monto, matricula_fecha, cobrar_desde
  ) VALUES (
    v_club_id, v_sol.nombre, v_sol.rut, v_sol.email, v_sol.telefono, v_sol.fecha_nacimiento,
    v_sol.direccion, v_sol.comuna,
    v_sol.contacto_emergencia_nombre, v_sol.contacto_emergencia_telefono, v_sol.indicaciones_medicas,
    v_sol.nombres, v_sol.apellido1, v_sol.apellido2, v_sol.apellido3, v_sol.talla_polera, v_sol.talla_short,
    'activo', false, 0,
    true, 20000, '2026-08-29', '2026-08-01'
  )
  RETURNING id INTO v_jugador_id;

  -- Reengancha el pago de matrícula que ya existía en el libro — no se crea
  -- un ingreso nuevo, que sería cobrarle la matrícula dos veces.
  UPDATE movimientos SET jugador_id = v_jugador_id
  WHERE id = v_movimiento_id AND jugador_id IS NULL;

  RAISE NOTICE 'Jugador restaurado con id %', v_jugador_id;
END $$;

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────

-- 1) La ficha nueva, con sus datos reales.
SELECT id, nombre, rut, email, telefono, estado, matricula_pagada, cobrar_desde
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND rut = '24938196-9';

-- 2) El movimiento de la matrícula, ya reenganchado (jugador_id NOT NULL).
SELECT id, descripcion, monto, jugador_id
FROM movimientos WHERE id = 'a326a609-0f91-43d9-9beb-8f2d4a9747e6';
