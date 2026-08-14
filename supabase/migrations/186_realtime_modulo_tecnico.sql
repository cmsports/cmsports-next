-- Las cinco tablas del módulo Técnico que estaban escuchando al vacío.
--
-- ── Otra vez lo mismo ─────────────────────────────────────────────────────
-- Tercera vez que muerde: la 121 con el horario, la 142 con movimientos y
-- credenciales, y ahora el módulo Técnico. Suscribirse a una tabla que no está
-- en `supabase_realtime` no da error: el canal se conecta, queda escuchando y
-- no llega nada nunca. La pantalla se ve perfecta y muestra datos viejos.
--
-- La 162 creó las tablas del módulo y la 175 publicó `tecnico_partidos` y
-- `tecnico_partido_eventos` —las del marcador, que se ven en vivo y por eso se
-- notó—. Las otras cinco quedaron afuera, pero el front igual se suscribe:
--
--   tecnico_eventos       tecnico/sesiones/[id]/page.tsx:262 y comparar:124
--   tecnico_videos        tecnico/sesiones/[id]/page.tsx:263
--   tecnico_objetivos     tecnico/objetivos/page.tsx:69
--   tecnico_sesiones      tecnico/comparar/page.tsx:124
--   tecnico_evaluaciones  tecnico/comparar/page.tsx:124
--
-- En la práctica: se sube un video o se marca un objetivo desde otro
-- dispositivo y la pantalla del profe no se entera hasta que recargue a mano.
--
-- ── Publicar no abre la tabla ─────────────────────────────────────────────
-- Realtime respeta RLS, así que esto no expone nada que la política no deje
-- leer ya. La verificación de abajo confirma que las cinco tienen RLS activo:
-- publicar una tabla SIN RLS sí sería abrirla, y por eso se chequea.
--
-- ── Es idempotente ────────────────────────────────────────────────────────
-- Cada ALTER en su propio bloque con EXCEPTION duplicate_object, igual que la
-- 121 y la 142: si alguna ya se agregó a mano desde el Dashboard, no revienta.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('186_realtime_modulo_tecnico');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_eventos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_videos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_objetivos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_sesiones;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_evaluaciones;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las cinco tienen que aparecer. Si falta alguna, esa sigue muda.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('tecnico_eventos','tecnico_videos','tecnico_objetivos',
                    'tecnico_sesiones','tecnico_evaluaciones')
ORDER BY tablename;

-- 2) Y que ninguna esté sin RLS: publicar sin RLS sí sería abrir la tabla.
--    Las cinco tienen que salir con rls = true y al menos una política.
SELECT c.relname AS tabla, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('tecnico_eventos','tecnico_videos','tecnico_objetivos',
                    'tecnico_sesiones','tecnico_evaluaciones')
ORDER BY c.relname;

-- 3) Panorama completo, por si alguna otra quedó escuchando al vacío.
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
