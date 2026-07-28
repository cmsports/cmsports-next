-- Cierra las cuatro tablas que la auditoría de políticas encontró abiertas.
--
-- LO QUE SE COMPROBÓ, con la llave pública que viaja en el navegador:
--
--   clase_jugadores        888 filas legibles · y ACEPTA escrituras
--   banco_fotos              3 filas legibles
--   club_photos              4 filas legibles
--   torneo_felicitaciones    vacía y ya bloqueada, pero su política dice `true`
--
-- EL CASO GRAVE ES clase_jugadores. La 001 le escribió dos políticas correctas
-- —lectura por club, escritura solo staff—, pero en la base hay además una
-- llamada `allow_all` con `FOR ALL USING (true)` que no está en ninguna
-- migración: alguien la creó desde el panel. Como las políticas se suman con
-- OR, esa una sola anula a las dos correctas. Es el mismo error que hizo que la
-- 095 no cerrara nada y obligó a escribir la 096.
--
-- Que la tabla no la lea ninguna línea del código no la hace inofensiva: los
-- datos están igual y la llave para leerlos es pública.
--
-- LAS FOTOS eran lectura pública a propósito según el comentario de la 001.
-- Pasan a pedir sesión: ninguna pantalla las usa hoy, así que no rompe nada, y
-- son fotos de un club con menores.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. clase_jugadores ════════════════════════════════════════════════════
-- Se borra cualquier política de la tabla y se reescriben las dos que
-- corresponden. Borrar solo `allow_all` alcanzaría hoy, pero si mañana aparece
-- otra creada a mano el agujero vuelve sin que nadie lo note.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'clase_jugadores'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.clase_jugadores', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.clase_jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clase_jugadores_select" ON public.clase_jugadores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
  );

CREATE POLICY "clase_jugadores_write" ON public.clase_jugadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'superadmin', 'profesor')
  );


-- ══ 2. Las fotos ══════════════════════════════════════════════════════════
-- `banco_fotos` no tiene club: es un banco compartido. Lo mínimo honesto es
-- pedir sesión, en vez de dejarlo a la llave pública.
DROP POLICY IF EXISTS "banco_fotos_select" ON public.banco_fotos;
CREATE POLICY "banco_fotos_select" ON public.banco_fotos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- `club_photos` se agrupa por `club_slug`, que no es el id del club, así que no
-- se puede atar a get_my_club_id(). Misma decisión: sesión iniciada.
DROP POLICY IF EXISTS "club_photos_select" ON public.club_photos;
CREATE POLICY "club_photos_select" ON public.club_photos
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ══ 3. torneo_felicitaciones ══════════════════════════════════════════════
-- La lee la campana de notificaciones para mostrar un conteo. No es sensible,
-- pero `true` deja la puerta abierta por si mañana se le agrega una columna que
-- sí lo sea. Queda para los del club.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'torneo_felicitaciones'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.torneo_felicitaciones', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.torneo_felicitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "felicitaciones_lectura" ON public.torneo_felicitaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
  );

-- Felicitar es cosa del jugador, y solo por sí mismo.
CREATE POLICY "felicitaciones_propia" ON public.torneo_felicitaciones
  FOR INSERT WITH CHECK (
    jugador_id = get_my_jugador_id()
    AND EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
  );

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe venir vacío: ninguna tabla sin RLS y ninguna política que deje pasar a
-- cualquiera.
SELECT tabla, rls, politica, comando
FROM public._auditoria_politicas()
WHERE rls = false OR btrim(lower(coalesce(expresion, ''))) = 'true'
ORDER BY tabla;
