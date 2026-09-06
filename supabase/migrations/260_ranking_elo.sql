-- ────────────────────────────────────────────────────────────
-- Índice de fuerza (Elo) — las dos tablas. §5.6 del plan maestro.
--
-- Este cambio afecta a: **todos los clubes en el esquema, ninguno en su
-- comportamiento.** Dos tablas vacías y un módulo apagado salvo en Spinhouse.
--
-- ══ Qué es, y qué NO reemplaza ══════════════════════════════════════════
--
-- El club pidió "un ranking calculado partido a partido según la fuerza del
-- rival". Eso NO es el ranking que ya existe: `rankingInterno.ts` premia el
-- PUESTO alcanzado en un torneo —100 al campeón, 90 al finalista—. Son dos
-- números con dos propósitos y los dos tienen que seguir existiendo: uno dice
-- quién ganó torneos, el otro dice quién es más fuerte hoy.
--
-- Ganarle al mejor del club suma mucho en Elo y cero en el ranking interno si
-- no fue en un torneo. Esa diferencia es la función, no un defecto.
--
-- ══ ⚠️ DÓNDE SE CALCULA, Y POR QUÉ NO ACÁ ═══════════════════════════════
--
-- Esta migración crea tablas. **No trae un trigger que calcule Elo**, y esa es
-- la decisión de diseño más importante del archivo.
--
-- La fórmula ya existe en `src/lib/domain/elo.ts`, con 17 pruebas que cubren la
-- conservación de la suma, el walkover y el K distinto para menores. Escribirla
-- otra vez en plpgsql daría dos implementaciones de la misma matemática, una
-- probada y otra no, que se van a separar en el primer arreglo que alguien haga
-- en una sola. Es exactamente el problema que tenían las cuatro listas de
-- categorías financieras, y costó una migración (258) descubrirlo.
--
-- Así que el índice lo calcula el código, con el motor probado, y estas tablas
-- solo guardan el resultado.
--
-- ══ La cola de pendientes no existe, y es a propósito ════════════════════
--
-- El marcador (`tecnico_partidos`) se escribe DIRECTO desde el navegador, no
-- pasa por ninguna Server Action. Verificado en
-- `app/tecnico/marcador/[id]/page.tsx`: `persistir()` hace el update solo. Así
-- que no hay un punto por donde encajar "y ahora actualiza el Elo".
--
-- La solución no es una tabla de cola ni un trigger: **la cola es un LEFT
-- JOIN.** Un partido está pendiente si está finalizado y todavía no tiene fila
-- en `ranking_elo_hist`. Sin tabla nueva, sin nada que se pueda desincronizar,
-- y con la propiedad de que reprocesar es inofensivo.
--
--     SELECT p.* FROM tecnico_partidos p
--     LEFT JOIN ranking_elo_hist h ON h.partido_ref = 'tecnico:' || p.id
--     WHERE p.estado = 'finalizado' AND h.id IS NULL;
--
-- ══ El UNIQUE que hace todo esto seguro ══════════════════════════════════
--
-- `(partido_ref, jugador_id)` es único. Si dos pestañas procesan a la vez —dos
-- entrenadores abriendo el ranking al mismo tiempo—, la segunda choca y no
-- duplica. Sin eso, un partido contaría dos veces y el índice quedaría inflado
-- sin que nadie pueda notarlo mirando el número.
--
-- ══ Por qué `partido_ref` es texto y no una FK ═══════════════════════════
--
-- Porque hay dos orígenes y uno no está en la base: el archivo histórico que el
-- club ya tiene en su planilla ('importado:...'), que el plan §5.6 marca con
-- candado porque sin él el índice arranca en cero y no significa nada durante
-- medio año. Una FK a `tecnico_partidos` no podría representarlo.
--
-- Y porque borrar un partido no tiene por qué borrar la historia del índice: si
-- se corrige un resultado, se recalcula a propósito con `recorrer()`, que para
-- eso existe.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('260_ranking_elo');
SELECT _migracion_para_todos_los_clubes('crea dos tablas vacías y enciende un módulo en un solo club; no toca filas');


-- ══ 1. El índice de hoy ═════════════════════════════════════════════════
--
-- Una fila por jugador. Es un caché: todo lo que hay acá se puede reconstruir
-- desde `ranking_elo_hist`, y esa es justamente la garantía que hace que se
-- pueda arreglar un resultado mal cargado sin quedar con un número torcido para
-- siempre.

CREATE TABLE IF NOT EXISTS public.ranking_elo (
  club_id        uuid NOT NULL REFERENCES public.clubes(id)    ON DELETE CASCADE,
  jugador_id     uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,

  elo            integer NOT NULL,

  -- Partidos que MOVIERON el índice. Un walkover que no cuenta tampoco suma
  -- acá: si sumara, el número diría que alguien compitió cuando no se presentó
  -- nadie. Es la misma regla que `recorrer()` en elo.ts.
  partidos       integer NOT NULL DEFAULT 0 CHECK (partidos >= 0),

  actualizado_en timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (club_id, jugador_id)
);

COMMENT ON TABLE public.ranking_elo IS
  'Caché del índice de fuerza actual. Reconstruible entero desde ranking_elo_hist — si los dos no coinciden, manda el historial.';


-- ══ 2. El historial, que es la fuente de verdad ═════════════════════════

CREATE TABLE IF NOT EXISTS public.ranking_elo_hist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  club_id      uuid NOT NULL REFERENCES public.clubes(id)    ON DELETE CASCADE,
  jugador_id   uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,

  fecha        date NOT NULL,

  -- 'tecnico:<uuid>' para un partido del marcador, 'importado:<lo que sea>'
  -- para el archivo histórico del club. Texto y no FK: ver el encabezado.
  partido_ref  text NOT NULL,

  elo_antes    integer NOT NULL,
  elo_despues  integer NOT NULL,

  -- El rival puede haberse borrado del club, y el partido igual pasó. Por eso
  -- ON DELETE SET NULL y no CASCADE: perder al rival no puede borrarle a este
  -- jugador un partido de su historia.
  rival_id     uuid REFERENCES public.jugadores(id) ON DELETE SET NULL,
  rival_elo    integer NOT NULL,

  resultado    text NOT NULL CHECK (resultado IN ('gana', 'pierde', 'walkover')),

  creado_en    timestamptz NOT NULL DEFAULT now(),

  -- ⚠️ LA LÍNEA QUE HACE QUE TODO ESTO SEA SEGURO. Sin ella, dos pestañas
  -- procesando a la vez cuentan el mismo partido dos veces y el índice queda
  -- inflado sin forma de darse cuenta mirando el número.
  CONSTRAINT ranking_elo_hist_una_vez UNIQUE (partido_ref, jugador_id)
);

-- El acceso real es "la curva de este jugador, en orden". La fecha sola no
-- alcanza para ordenar: dos partidos del mismo día necesitan el desempate.
CREATE INDEX IF NOT EXISTS ranking_elo_hist_curva_idx
  ON public.ranking_elo_hist (jugador_id, fecha, creado_en);

CREATE INDEX IF NOT EXISTS ranking_elo_hist_club_idx
  ON public.ranking_elo_hist (club_id, fecha DESC);

COMMENT ON TABLE public.ranking_elo_hist IS
  'Cada movimiento del índice, de solo agregar. Es la fuente de verdad: ranking_elo se puede reconstruir desde acá. `partido_ref` es texto con prefijo del origen (tecnico: | importado:) porque el archivo histórico del club no vive en ninguna tabla.';


-- ══ 3. Las políticas ════════════════════════════════════════════════════
--
-- **El ranking lo ve todo el club, incluidos los jugadores.** No es una
-- concesión: un ranking que solo ve el staff no es un ranking, es una planilla.
-- El club lo pidió para que los alumnos sepan dónde están parados.
--
-- Escribir, solo el staff. Y ni siquiera eso alcanza para que un entrenador se
-- invente un número: quien escribe es una Server Action que calcula desde los
-- partidos, no un formulario.

ALTER TABLE public.ranking_elo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_elo_hist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_elo_lee_el_club" ON public.ranking_elo;
CREATE POLICY "ranking_elo_lee_el_club" ON public.ranking_elo
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "ranking_elo_escribe_staff" ON public.ranking_elo;
CREATE POLICY "ranking_elo_escribe_staff" ON public.ranking_elo
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DROP POLICY IF EXISTS "ranking_elo_hist_lee_el_club" ON public.ranking_elo_hist;
CREATE POLICY "ranking_elo_hist_lee_el_club" ON public.ranking_elo_hist
  FOR SELECT USING (club_id = get_my_club_id());

-- Solo INSERT: el historial es de solo agregar, igual que el de
-- consentimientos (259). Corregir un resultado se hace recalculando, no
-- editando una fila — que es lo que deja el número torcido sin rastro.
DROP POLICY IF EXISTS "ranking_elo_hist_agrega_staff" ON public.ranking_elo_hist;
CREATE POLICY "ranking_elo_hist_agrega_staff" ON public.ranking_elo_hist
  FOR INSERT
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

-- El superadmin sí puede borrar: recalcular desde cero necesita poder vaciar.
DROP POLICY IF EXISTS "ranking_elo_hist_superadmin" ON public.ranking_elo_hist;
CREATE POLICY "ranking_elo_hist_superadmin" ON public.ranking_elo_hist
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');

DROP POLICY IF EXISTS "ranking_elo_superadmin" ON public.ranking_elo;
CREATE POLICY "ranking_elo_superadmin" ON public.ranking_elo
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');


-- ══ 4. Realtime ═════════════════════════════════════════════════════════
DO $$
DECLARE v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['ranking_elo', 'ranking_elo_hist'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$$;


-- ══ 5. El módulo, solo para Spinhouse ═══════════════════════════════════
--
-- Apagado para los demás. Buin tiene su ranking por puesto y no pidió otro: dos
-- rankings en el menú de un club que quiere uno solo es peor que ninguno.

UPDATE public.clubes
SET    modulos_habilitados = array_append(modulos_habilitados, 'ranking_elo')
WHERE  nombre ILIKE '%spinhouse%'
  AND  NOT ('ranking_elo' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;


-- ══ Verificación (correr aparte, después del COMMIT) ════════════════════
--
-- 1) Las dos tablas nacen vacías. Tienen que dar 0 y 0.
-- SELECT (SELECT count(*) FROM ranking_elo)      AS elo,
--        (SELECT count(*) FROM ranking_elo_hist) AS hist;
--
-- 2) ⚠️ LA IMPORTANTE: que el UNIQUE esté. Sin él, un partido puede contarse
--    dos veces y el índice queda inflado en silencio.
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.ranking_elo_hist'::regclass AND contype = 'u';
--
-- 3) Publicadas en realtime. Tienen que aparecer las dos.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename LIKE 'ranking_elo%';
--
-- 4) El módulo quedó solo en Spinhouse. Los otros cinco en false.
-- SELECT nombre, 'ranking_elo' = ANY(modulos_habilitados) AS elo
-- FROM   public.clubes ORDER BY nombre;
--
-- 5) Cuántos partidos del marcador esperan ser procesados. Con el módulo recién
--    encendido, esto es todo lo que el club ya jugó por el marcador.
-- SELECT c.nombre, count(*) AS partidos_pendientes
-- FROM   public.tecnico_partidos p
-- JOIN   public.clubes c ON c.id = p.club_id
-- LEFT   JOIN public.ranking_elo_hist h ON h.partido_ref = 'tecnico:' || p.id
-- WHERE  p.estado = 'finalizado' AND h.id IS NULL
--   AND  p.jugador_a_id IS NOT NULL AND p.jugador_b_id IS NOT NULL
-- GROUP  BY c.nombre;
