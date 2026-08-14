-- Categorías de torneo inventadas por el club.
--
-- ── El problema ───────────────────────────────────────────────────────────
-- El selector de categoría al crear un torneo interno no lee de ningún lado:
-- barre `jugadores.categoria` y ofrece los valores distintos que encuentra. Eso
-- significa que una categoría solo existe mientras algún jugador la tenga
-- escrita en su ficha. Para armar un torneo "MASTER Z" había que ir antes a la
-- ficha de alguien y escribírsela a mano, y si después ese jugador cambiaba de
-- categoría o se borraba, la opción desaparecía sola del selector.
--
-- Esta tabla es el catálogo que faltaba: una categoría creada acá existe por sí
-- misma, sin depender de que alguien la tenga puesta.
--
-- ── Qué NO es ─────────────────────────────────────────────────────────────
-- No reemplaza ni toca `jugadores.categoria`, que sigue saliendo del año de
-- nacimiento (ver categoriaBuin.ts). Esto es solo la etiqueta del torneo, y por
-- lo tanto del ranking: la pantalla de Ranking agrupa por `torneos.categoria`,
-- así que un torneo con una categoría de acá arma su ranking solo, sin que haya
-- que enseñarle nada.
--
-- ── Sin UPDATE ni DELETE ──────────────────────────────────────────────────
-- Una vez creada queda para siempre, igual que PENECA o TC. Borrar una que ya
-- tiene torneos dejaría esos torneos apuntando a un nombre que no existe y su
-- ranking sin título. Para limpiar rankings ya está "Reiniciar Ranking", que
-- corta por fecha y sirve igual para todas las categorías.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('143_categorias_personalizadas_torneo');


CREATE TABLE IF NOT EXISTS public.categorias_personalizadas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  nombre    text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Por club y sin distinguir mayúsculas: "Master Z" y "MASTER Z" son la misma
-- categoría escrita dos veces, y dos filas así partirían el ranking en dos.
CREATE UNIQUE INDEX IF NOT EXISTS categorias_personalizadas_club_nombre_idx
  ON public.categorias_personalizadas (club_id, lower(nombre));

ALTER TABLE public.categorias_personalizadas ENABLE ROW LEVEL SECURITY;

-- Lectura para todo el club: es la misma visibilidad que ya tienen hoy las
-- categorías sacadas de las fichas.
DROP POLICY IF EXISTS "categorias_personalizadas_lectura" ON public.categorias_personalizadas;
CREATE POLICY "categorias_personalizadas_lectura" ON public.categorias_personalizadas
  FOR SELECT USING (club_id = get_my_club_id());

-- Crear es de admin, el mismo rol que ya puede crear el torneo que la va a usar.
DROP POLICY IF EXISTS "categorias_personalizadas_crear" ON public.categorias_personalizadas;
CREATE POLICY "categorias_personalizadas_crear" ON public.categorias_personalizadas
  FOR INSERT WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) La tabla quedó con RLS prendido:
SELECT relname, relrowsecurity AS rls_activo
FROM pg_class WHERE relname = 'categorias_personalizadas';

-- 2) Las dos políticas, y ninguna de UPDATE o DELETE:
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'categorias_personalizadas' ORDER BY policyname;

-- 3) El índice único está (1 fila es lo correcto):
SELECT indexname FROM pg_indexes
WHERE tablename = 'categorias_personalizadas' AND indexname LIKE '%club_nombre%';
