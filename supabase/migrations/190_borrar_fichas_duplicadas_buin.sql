-- Las siete fichas sueltas que duplicaban a un socio de Buin.
--
-- ── De dónde salieron ─────────────────────────────────────────────────────
-- Hasta ahora la lista para inscribir a un torneo interno excluía a las
-- visitas, así que cuando venía alguien que no aparecía, el nombre se escribía
-- a mano — y eso creaba una ficha nueva. Pero los que no aparecían no eran
-- desconocidos: eran socios del propio club a los que el buscador no
-- encontraba. Resultado: siete personas con dos fichas, la real con su RUT y
-- una copia vacía con el nombre en minúsculas.
--
-- El origen ya está tapado: la lista de inscripción ahora muestra también a las
-- visitas, marcadas como tales, así que quien inscribe ve que la persona ya
-- existe en vez de crearla de nuevo.
--
--   "Agustin Quinteros"  ->  Agustín Quinteros quinteros      23099644-k
--   "Renato Amigo"       ->  Renato Andrés Amigo León         23482539-9
--   "ivan loyola"        ->  Iván Loyola Carvajal             20888735-1
--   "Benjamin gaete"     ->  Benjamin Alfredo Gaete Inostroza 23176528-K
--   "matias vasquez"     ->  Matías Cristian Vasquez Rodríguez 24389173-6
--   "Fernando Urriola"   ->  Fernando Alonso Urriola Jara     23219813-3
--   "alvaro labrin"      ->  Álvaro Adolfo Labrin Decar       18087148-9
--
-- ── Por qué se borran y no se fusionan ────────────────────────────────────
-- Porque no hay nada que fusionar: las siete están vacías. Se revisó una por
-- una y ninguna tiene partidos, asistencia, mensualidades, pagos, movimientos,
-- bloques, documentos ni saldo de ranking. Son cascarones con un nombre.
--
-- El ranking del papel ya se cargó en la ficha REAL de cada uno —la asociación
-- eligió cuál era en la segunda ronda del cuestionario— así que borrar estas no
-- mueve ningún puntaje.
--
-- ── La guarda ────────────────────────────────────────────────────────────
-- Igual se vuelve a comprobar acá adentro, y si alguna dejó de estar vacía
-- entre que se revisó y que se pega esto, aborta sin borrar nada. Varias de las
-- tablas que cuelgan de `jugadores` van en cascada: borrar a ciegas una ficha
-- que empezó a usarse se llevaría por delante datos reales.
--
-- ── Nota de ejecución (2026-08-15) ───────────────────────────────────────
-- Esta migración YA SE APLICÓ y las siete fichas están borradas. Se deja el
-- archivo como registro de qué se hizo y por qué.
--
-- Al correrla, el SQL Editor devolvió «la relación "_fichas_duplicadas" no
-- existe» DESPUÉS de haber borrado: la tabla `TEMP ... ON COMMIT DROP` se
-- destruye en el COMMIT, y las consultas de verificación que venían debajo ya
-- no la encontraban. El borrado sí se confirmó; el error era de la comprobación
-- final. Se reescribió sin tabla temporal —todo dentro de un DO, que es atómico
-- por sí solo— para que la próxima que copie este patrón no se lleve el susto.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-08-15

BEGIN;

SELECT _migracion_nueva('190_borrar_fichas_duplicadas_buin');

-- Todo en un solo DO: es atómico por sí mismo y no necesita tabla temporal.
-- La versión anterior usaba `TEMP ... ON COMMIT DROP` y el SQL Editor la
-- destruía antes de las comprobaciones finales.
DO $$
DECLARE
  ficha   record;
  usos    text;
  cuantas int := 0;
BEGIN
  FOR ficha IN
    SELECT * FROM (VALUES
      ('5ac11d1f-c67f-44f4-9e92-77a6f6e1a370'::uuid, 'Agustin Quinteros'),
      ('830bd948-8d16-47c0-9cd4-355e0a73abc2'::uuid, 'Renato Amigo'),
      ('b9989d5a-6aef-4fde-a895-2fb6371ddd97'::uuid, 'ivan loyola'),
      ('b3f4da1a-88da-43e9-90e3-2e19555d0d49'::uuid, 'Benjamin gaete'),
      ('ac026997-3782-409c-9d96-c16bc07cf38b'::uuid, 'matias vasquez'),
      ('eba45be9-48e2-4098-81b6-d1bde6420cb5'::uuid, 'Fernando Urriola'),
      ('bd757887-8496-49d2-af23-f482927eca3d'::uuid, 'alvaro labrin')
    ) AS t(id, nombre_esperado)
  LOOP
    -- 1) Que sea la que creemos: del club correcto, externa y sin RUT. Si el
    --    id apunta a otra persona, esto lo caza antes de borrar a nadie.
    IF NOT EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = ficha.id
        AND j.nombre = ficha.nombre_esperado
        AND j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
        AND coalesce(j.es_externo, false) = true
        AND j.rut IS NULL
    ) THEN
      -- Ya borrada en una pasada anterior: se salta, no es un error.
      IF NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = ficha.id) THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'La ficha % no es la esperada (%)', ficha.id, ficha.nombre_esperado;
    END IF;

    -- 2) Que siga vacía. Cualquier dato colgando y aborta todo: varias de las
    --    tablas que cuelgan de `jugadores` van en cascada, así que borrar una
    --    ficha que empezó a usarse se llevaría datos reales por delante.
    SELECT string_agg(fuente, ', ') INTO usos FROM (
      SELECT 'partidos' AS fuente WHERE EXISTS (
        SELECT 1 FROM public.torneo_partidos p
        WHERE p.jugador_a = ficha.id OR p.jugador_b = ficha.id OR p.ganador = ficha.id)
      UNION ALL SELECT 'inscripciones' WHERE EXISTS (
        SELECT 1 FROM public.torneo_jugadores x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'grupos' WHERE EXISTS (
        SELECT 1 FROM public.grupo_jugadores x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'pagos de torneo' WHERE EXISTS (
        SELECT 1 FROM public.torneo_pagos x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'ranking' WHERE EXISTS (
        SELECT 1 FROM public.ranking_saldo_inicial x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'asistencia' WHERE EXISTS (
        SELECT 1 FROM public.asistencia x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'mensualidades' WHERE EXISTS (
        SELECT 1 FROM public.mensualidades x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'movimientos' WHERE EXISTS (
        SELECT 1 FROM public.movimientos x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'bloques' WHERE EXISTS (
        SELECT 1 FROM public.bloque_jugadores x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'cuenta de usuario' WHERE EXISTS (
        SELECT 1 FROM public.perfiles x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'clases extra' WHERE EXISTS (
        SELECT 1 FROM public.clases_extraordinarias x WHERE x.jugador_id = ficha.id)
      UNION ALL SELECT 'documentos' WHERE EXISTS (
        SELECT 1 FROM public.jugador_documentos x WHERE x.jugador_id = ficha.id)
    ) t;

    IF usos IS NOT NULL THEN
      RAISE EXCEPTION 'La ficha "%" ya no está vacía (%), no se borra nada',
        ficha.nombre_esperado, usos;
    END IF;

    DELETE FROM public.jugadores WHERE id = ficha.id;
    cuantas := cuantas + 1;
  END LOOP;

  RAISE NOTICE 'Fichas duplicadas borradas: %', cuantas;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las siete personas quedan con UNA sola ficha, la que tiene RUT.
SELECT nombre, rut, categoria, es_externo, estado
FROM public.jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND rut IN ('23099644-k','23482539-9','20888735-1','23176528-K',
              '24389173-6','23219813-3','18087148-9')
ORDER BY nombre;

-- 2) Y su ranking sigue en pie: siete filas o más, ninguna perdida.
SELECT j.nombre, s.categoria, s.puntos
FROM public.ranking_saldo_inicial s
JOIN public.jugadores j ON j.id = s.jugador_id
WHERE s.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND j.rut IN ('23099644-k','23482539-9','20888735-1','23176528-K',
                '24389173-6','23219813-3','18087148-9')
ORDER BY j.nombre, s.categoria;
