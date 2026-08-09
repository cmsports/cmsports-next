-- Cinco tablas que las pantallas escuchan y que nunca emitieron nada.
--
-- ── Los dos síntomas que lo destaparon ────────────────────────────────────
-- "Le cobré a Jonathan y no me aparece como movimiento ni ingreso."
-- "Creé la cuenta de Edison y no sale en el informe de credenciales."
--
-- Los datos estaban bien en los dos casos: el movimiento de $3.000 existía y
-- era el PRIMERO que devolvía la consulta de la pantalla, y la cuenta de
-- Edison estaba creada. Lo que no pasaba era el refresco. Había que recargar a
-- mano para ver algo que ya estaba ahí.
--
-- ── La causa ──────────────────────────────────────────────────────────────
-- `useEnVivo` se suscribe a `postgres_changes` de las tablas que le pasan,
-- pero Postgres solo emite eventos de las tablas que están en la publicación
-- `supabase_realtime`. Suscribirse a una que no está no da error: se conecta,
-- queda escuchando y no llega nada nunca.
--
-- Comparando lo que el código escucha contra lo que la publicación tiene,
-- faltaban cinco:
--
--   movimientos         Finanzas escucha ['movimientos','mensualidades'] y solo
--                       le llegaban las mensualidades. Un ingreso nuevo —un
--                       cobro de clase extra, un gasto— no refrescaba nada.
--   credencial_visible  Credenciales escucha las tres de abajo y solo recibía
--   perfiles            `jugadores`. Crear un acceso no aparecía en el informe
--                       hasta recargar.
--   torneo_partidos     El tablero no refrescaba resultados.
--   bloque_profesores   Cambios de profesor asignado a un bloque.
--
-- Es el mismo agujero que la 121 tapó para `bloques_horario` y
-- `clases_extraordinarias`, con la misma frase en su encabezado: "el panel se
-- suscribía desde que existe la tabla y jamás recibió nada".
--
-- ── Sobre publicar `perfiles` y `credencial_visible` ──────────────────────
-- Son las dos que tienen datos sensibles, así que la pregunta es obligatoria:
-- publicar una tabla en Realtime NO la abre. Postgres Changes aplica la RLS de
-- la tabla a cada suscriptor, que solo recibe las filas que podría leer con un
-- SELECT. Verificado antes de escribir esto: las cinco tienen RLS activo y
-- políticas puestas (2, 2, 4, 3 y 2 respectivamente).
--
-- ── Es idempotente ────────────────────────────────────────────────────────
-- Cada ALTER va en su propio bloque con EXCEPTION duplicate_object, igual que
-- la 121: si alguna ya se agregó a mano desde el Dashboard, no revienta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('142_realtime_movimientos_y_credenciales');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.movimientos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.credencial_visible;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_partidos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bloque_profesores;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las cinco tienen que aparecer. Si falta alguna, esa sigue muda.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('movimientos','credencial_visible','perfiles','torneo_partidos','bloque_profesores')
ORDER BY tablename;

-- 2) Y que ninguna de las cinco esté sin RLS: publicar sin RLS sí sería abrir
--    la tabla. Las cinco tienen que salir con rls = true.
SELECT c.relname AS tabla, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('movimientos','credencial_visible','perfiles','torneo_partidos','bloque_profesores')
ORDER BY c.relname;

-- 3) Panorama completo, por si alguna otra quedó escuchando al vacío.
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
