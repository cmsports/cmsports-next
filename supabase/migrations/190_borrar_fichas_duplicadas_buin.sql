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
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('190_borrar_fichas_duplicadas_buin');

CREATE TEMP TABLE _fichas_duplicadas (id uuid, nombre_esperado text) ON COMMIT DROP;
INSERT INTO _fichas_duplicadas (id, nombre_esperado) VALUES
  ('5ac11d1f-c67f-44f4-9e92-77a6f6e1a370', 'Agustin Quinteros'),
  ('830bd948-8d16-47c0-9cd4-355e0a73abc2', 'Renato Amigo'),
  ('b9989d5a-6aef-4fde-a895-2fb6371ddd97', 'ivan loyola'),
  ('b3f4da1a-88da-43e9-90e3-2e19555d0d49', 'Benjamin gaete'),
  ('ac026997-3782-409c-9d96-c16bc07cf38b', 'matias vasquez'),
  ('eba45be9-48e2-4098-81b6-d1bde6420cb5', 'Fernando Urriola'),
  ('bd757887-8496-49d2-af23-f482927eca3d', 'alvaro labrin');

-- 1) Que sean las que creemos: del club correcto, externas y sin RUT. Si el id
--    apunta a otra persona, esto lo caza antes de borrar a nadie.
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(coalesce(j.nombre, '(no existe)') || ' <> ' || d.nombre_esperado, ' | ')
    INTO malas
  FROM _fichas_duplicadas d
  LEFT JOIN public.jugadores j ON j.id = d.id
  WHERE j.id IS NULL
     OR j.nombre IS DISTINCT FROM d.nombre_esperado
     OR j.club_id <> 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
     OR coalesce(j.es_externo, false) = false
     OR j.rut IS NOT NULL;
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Alguna ficha no es la esperada: %', malas;
  END IF;
END $$;

-- 2) Que sigan vacías. Cualquier dato colgando y no se borra nada.
DO $$
DECLARE con_datos text;
BEGIN
  SELECT string_agg(nombre || ' (' || fuente || ')', ', ') INTO con_datos FROM (
    SELECT j.nombre, x.fuente
    FROM _fichas_duplicadas d
    JOIN public.jugadores j ON j.id = d.id
    CROSS JOIN LATERAL (
      SELECT 'partidos' AS fuente WHERE EXISTS (
        SELECT 1 FROM public.torneo_partidos p
        WHERE p.jugador_a = d.id OR p.jugador_b = d.id OR p.ganador = d.id)
      UNION ALL SELECT 'inscripciones' WHERE EXISTS (
        SELECT 1 FROM public.torneo_jugadores t WHERE t.jugador_id = d.id)
      UNION ALL SELECT 'grupos' WHERE EXISTS (
        SELECT 1 FROM public.grupo_jugadores g WHERE g.jugador_id = d.id)
      UNION ALL SELECT 'pagos de torneo' WHERE EXISTS (
        SELECT 1 FROM public.torneo_pagos tp WHERE tp.jugador_id = d.id)
      UNION ALL SELECT 'ranking' WHERE EXISTS (
        SELECT 1 FROM public.ranking_saldo_inicial r WHERE r.jugador_id = d.id)
      UNION ALL SELECT 'asistencia' WHERE EXISTS (
        SELECT 1 FROM public.asistencia a WHERE a.jugador_id = d.id)
      UNION ALL SELECT 'mensualidades' WHERE EXISTS (
        SELECT 1 FROM public.mensualidades m WHERE m.jugador_id = d.id)
      UNION ALL SELECT 'movimientos' WHERE EXISTS (
        SELECT 1 FROM public.movimientos mv WHERE mv.jugador_id = d.id)
      UNION ALL SELECT 'bloques' WHERE EXISTS (
        SELECT 1 FROM public.bloque_jugadores b WHERE b.jugador_id = d.id)
      UNION ALL SELECT 'cuenta de usuario' WHERE EXISTS (
        SELECT 1 FROM public.perfiles pe WHERE pe.jugador_id = d.id)
      UNION ALL SELECT 'clases extra' WHERE EXISTS (
        SELECT 1 FROM public.clases_extraordinarias ce WHERE ce.jugador_id = d.id)
      UNION ALL SELECT 'documentos' WHERE EXISTS (
        SELECT 1 FROM public.jugador_documentos jd WHERE jd.jugador_id = d.id)
    ) x
  ) t;
  IF con_datos IS NOT NULL THEN
    RAISE EXCEPTION 'Estas fichas ya no están vacías, no se borra nada: %', con_datos;
  END IF;
END $$;

DELETE FROM public.jugadores
WHERE id IN (SELECT id FROM _fichas_duplicadas);

-- 3) Las siete, ni una más.
DO $$
DECLARE borradas int;
BEGIN
  SELECT count(*) INTO borradas
  FROM _fichas_duplicadas d
  WHERE NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = d.id);
  IF borradas <> 7 THEN
    RAISE EXCEPTION 'Se esperaban 7 fichas borradas y fueron %', borradas;
  END IF;
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
