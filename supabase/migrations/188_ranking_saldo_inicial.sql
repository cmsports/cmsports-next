-- El ranking que el club traía en papel, como punto de partida.
--
-- ── Por qué hace falta una tabla ──────────────────────────────────────────
-- El ranking se calcula al vuelo desde `torneo_partidos`: no hay puntos
-- guardados en ningún lado, y eso está bien porque así nunca se desincroniza.
-- Pero la Asociación Buin-Paine viene arrastrando un ranking en planilla desde
-- antes de usar el sistema, y esos torneos no están cargados. Sus puntos no se
-- pueden recalcular: no existe el partido del que salieron.
--
-- Entonces se guardan como saldo de arranque, y los torneos que se carguen de
-- ahora en adelante suman ENCIMA de este número.
--
-- ── jugador_id es FK, y es a propósito ────────────────────────────────────
-- El saldo queda colgado de una ficha, no de un nombre escrito. Es imposible
-- guardar puntos de alguien que no existe. Importa porque el ranking se acumula
-- por jugador: si el saldo se atara a un texto y mañana ese texto no calza con
-- nadie, esos puntos quedarían flotando, o peor, se los llevaría otra persona.
-- Identificar mal a alguien acá no es un error de una fila: es un error que se
-- arrastra en cada torneo que venga.
--
-- ── Convive con "Reiniciar Ranking" ───────────────────────────────────────
-- El botón de reinicio guarda una fecha en `clubes.ranking_reiniciado_en` y el
-- cálculo ignora los torneos anteriores. El saldo se comporta igual: lleva su
-- `creado_en` y el front lo descarta si el reinicio es posterior. Sin eso, el
-- botón mentiría — dejaría el ranking en cero salvo por este arrastre.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('188_ranking_saldo_inicial');

CREATE TABLE IF NOT EXISTS public.ranking_saldo_inicial (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    uuid NOT NULL REFERENCES public.clubes(id)    ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  categoria  text NOT NULL,
  genero     text,
  puntos     integer NOT NULL CHECK (puntos >= 0),
  -- De dónde salió este número, para que dentro de un año se sepa.
  origen     text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

-- Un jugador tiene un solo saldo por categoría y género. `coalesce` porque en
-- SQL dos NULL no son iguales, así que sin esto un género vacío se podría
-- cargar dos veces para la misma persona.
CREATE UNIQUE INDEX IF NOT EXISTS ranking_saldo_inicial_unico
  ON public.ranking_saldo_inicial (club_id, jugador_id, categoria, coalesce(genero, ''));

CREATE INDEX IF NOT EXISTS ranking_saldo_inicial_club_idx
  ON public.ranking_saldo_inicial (club_id);

ALTER TABLE public.ranking_saldo_inicial ENABLE ROW LEVEL SECURITY;

-- Lo lee cualquiera del club: el ranking es público adentro del club, y el
-- jugador ve el suyo en su perfil.
DROP POLICY IF EXISTS "ranking_saldo_lectura" ON public.ranking_saldo_inicial;
CREATE POLICY "ranking_saldo_lectura" ON public.ranking_saldo_inicial
  FOR SELECT USING (club_id = get_my_club_id());

-- Escribe solo el admin, igual que el resto de lo que toca el ranking.
DROP POLICY IF EXISTS "ranking_saldo_crear" ON public.ranking_saldo_inicial;
CREATE POLICY "ranking_saldo_crear" ON public.ranking_saldo_inicial
  FOR INSERT WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "ranking_saldo_editar" ON public.ranking_saldo_inicial;
CREATE POLICY "ranking_saldo_editar" ON public.ranking_saldo_inicial
  FOR UPDATE USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
           WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "ranking_saldo_borrar" ON public.ranking_saldo_inicial;
CREATE POLICY "ranking_saldo_borrar" ON public.ranking_saldo_inicial
  FOR DELETE USING (club_id = get_my_club_id() AND get_my_rol() = 'admin');

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) La tabla existe y está vacía: los datos entran en la 189.
SELECT count(*) AS filas FROM public.ranking_saldo_inicial;

-- 2) RLS activo y sus cuatro políticas.
SELECT c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'ranking_saldo_inicial') AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'ranking_saldo_inicial';
