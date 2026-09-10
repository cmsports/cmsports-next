-- Torneos por equipos: Swaythling y Corbillon.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Crea cuatro tablas vacías y agrega tres columnas nullable a
-- `torneo_partidos` que nacen en NULL para el 100 % de las filas existentes.
-- Lo único que se enciende es el módulo, y solo para Spinhouse.
--
-- ══ 1. Por qué esto necesita tablas propias ═══════════════════════════════
--
-- Todo el módulo de torneos asume que **un partido es entre dos jugadores**:
-- `torneo_partidos` tiene `jugador_a` y `jugador_b`, y nada más. El formato por
-- equipos rompe ese supuesto en tres lugares a la vez:
--
--   · El participante es un EQUIPO, no una persona.
--   · Un ENCUENTRO entre dos equipos contiene cinco partidos y tiene su propio
--     resultado (3-0, 3-1, 3-2).
--   · Uno de esos cinco puede ser un DOBLES: cuatro personas en una tabla que
--     tiene dos lados.
--
-- Por eso los equipos van en tablas nuevas en vez de forzarse en las que hay.
-- Lo único que se toca de lo existente son tres columnas nullable.
--
-- ══ 2. Los dos sistemas ═══════════════════════════════════════════════════
--
--   swaythling   5 individuales · 3 jugadores por equipo
--                A-X · B-Y · C-Z · A-Y · B-X
--   corbillon    4 individuales + 1 dobles · 2 a 4 jugadores
--                A-X · B-Y · DOBLES · A-Y · B-X
--
-- Los dos al mejor de 5: el encuentro termina apenas un equipo gana 3, así que
-- un 3-0 juega tres partidos y deja dos sin jugar. **Eso no es un encuentro
-- incompleto: es el resultado correcto**, y cualquier reporte que cuente
-- partidos jugados tiene que contar con ello.
--
-- El orden de los cruces NO va en la base ni en `club_config`: es reglamento
-- ITTF y vive como constante en src/lib/domain/torneoEquipos.ts. Si se pudiera
-- configurar, el torneo dejaría de ser Swaythling.
--
-- ══ 3. Por qué las cabezas de serie necesitan tabla aparte ════════════════
--
-- `torneo_cabezas_serie` tiene `jugador_id NOT NULL` con FK a `jugadores`, y
-- dentro de su clave primaria. En un torneo por equipos se siembra el EQUIPO,
-- no el jugador: el mejor equipo no es necesariamente el del mejor jugador. No
-- hay forma de meter un equipo ahí sin romper la FK o inventar un jugador
-- falso, que sería peor. De ahí `torneo_equipos_cabezas`, hermana y no
-- reemplazo: la existente no cambia en nada.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-09 hora de Chile (queda como 2026-09-10 en _migraciones_aplicadas, que guarda UTC)

BEGIN;
SELECT _migracion_nueva('266_torneos_por_equipos');
SELECT _migracion_para_todos_los_clubes(
  'crea cuatro tablas vacías y agrega columnas nullable; no toca el contenido de ninguna fila existente');

-- ── 1. El torneo declara su sistema ────────────────────────────────────────
-- Nullable a propósito: solo la modalidad 'equipos' lo mira, y un torneo que no
-- es de equipos no tiene por qué declarar nada.
ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS sistema_equipos text;

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_sistema_equipos_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_sistema_equipos_check
  CHECK (sistema_equipos IS NULL OR sistema_equipos IN ('swaythling', 'corbillon'));

COMMENT ON COLUMN public.torneos.sistema_equipos IS
  'Solo para la modalidad equipos: swaythling (5 individuales) o corbillon (4 y un dobles). NULL en las demás modalidades.';

-- ── 2. Los equipos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torneo_equipos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id         uuid NOT NULL REFERENCES public.torneos(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  club_procedencia  text,
  orden             integer NOT NULL DEFAULT 0,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torneo_equipos_nombre_unico UNIQUE (torneo_id, nombre)
);

CREATE INDEX IF NOT EXISTS torneo_equipos_torneo_idx
  ON public.torneo_equipos (torneo_id);

-- ── 3. Quiénes lo integran ─────────────────────────────────────────────────
-- `orden` es la alineación POR DEFECTO (0 = A, 1 = B, 2 = C). La de cada
-- encuentro se declara aparte, porque un equipo puede alinear distinto contra
-- dos rivales y esa es la decisión táctica del sistema.
CREATE TABLE IF NOT EXISTS public.torneo_equipo_jugadores (
  equipo_id   uuid NOT NULL REFERENCES public.torneo_equipos(id) ON DELETE CASCADE,
  jugador_id  uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  orden       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (equipo_id, jugador_id)
);

CREATE INDEX IF NOT EXISTS torneo_equipo_jugadores_jugador_idx
  ON public.torneo_equipo_jugadores (jugador_id);

-- ── 4. La siembra, de equipos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torneo_equipos_cabezas (
  torneo_id  uuid NOT NULL REFERENCES public.torneos(id) ON DELETE CASCADE,
  equipo_id  uuid NOT NULL REFERENCES public.torneo_equipos(id) ON DELETE CASCADE,
  numero     integer NOT NULL CHECK (numero BETWEEN 1 AND 32),
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (torneo_id, equipo_id),
  CONSTRAINT torneo_equipos_cabezas_numero_unico UNIQUE (torneo_id, numero)
);

-- ── 5. El encuentro: contenedor de cinco partidos ──────────────────────────
CREATE TABLE IF NOT EXISTS public.torneo_encuentros (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id          uuid NOT NULL REFERENCES public.torneos(id) ON DELETE CASCADE,
  fase               text NOT NULL,
  orden              integer NOT NULL DEFAULT 0,
  equipo_a_id        uuid REFERENCES public.torneo_equipos(id) ON DELETE SET NULL,
  equipo_b_id        uuid REFERENCES public.torneo_equipos(id) ON DELETE SET NULL,
  sistema            text NOT NULL CHECK (sistema IN ('swaythling', 'corbillon')),
  ganador_equipo_id  uuid REFERENCES public.torneo_equipos(id) ON DELETE SET NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torneo_encuentros_fase_check
    CHECK (fase IN ('grupos', 'avance', '32vos', '16vos', '8vos',
                    'cuartos', 'semis', 'final', 'tercer_lugar')),
  -- Mismo criterio que `torneo_partidos`: dos encuentros no comparten slot.
  CONSTRAINT torneo_encuentros_slot_unico UNIQUE (torneo_id, fase, orden)
);

CREATE INDEX IF NOT EXISTS torneo_encuentros_torneo_idx
  ON public.torneo_encuentros (torneo_id);

COMMENT ON TABLE public.torneo_encuentros IS
  'Un encuentro entre dos equipos, contenedor de hasta 5 partidos. Termina apenas un equipo gana 3, así que un 3-0 deja dos partidos sin jugar: eso es correcto, no un encuentro a medias. El marcador no se guarda acá porque se deriva de los partidos hijos (resultadoEncuentro en torneoEquipos.ts).';

-- ── 6. Lo que se le agrega a torneo_partidos ───────────────────────────────
-- Las tres nullable, y ahí está la clave de que nada cambie: un partido
-- individual las deja en NULL y toda consulta de hoy sigue leyendo `jugador_a`
-- y `jugador_b` como siempre.
ALTER TABLE public.torneo_partidos
  ADD COLUMN IF NOT EXISTS encuentro_id uuid REFERENCES public.torneo_encuentros(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS jugador_a2 uuid REFERENCES public.jugadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jugador_b2 uuid REFERENCES public.jugadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_en_encuentro smallint;

CREATE INDEX IF NOT EXISTS torneo_partidos_encuentro_idx
  ON public.torneo_partidos (encuentro_id);

COMMENT ON COLUMN public.torneo_partidos.jugador_a2 IS
  'Segundo jugador del lado A. Solo en el dobles de un encuentro por equipos; NULL en todo partido individual.';
COMMENT ON COLUMN public.torneo_partidos.numero_en_encuentro IS
  'Posición del partido dentro del encuentro (1 a 5), en el orden que fija el reglamento del sistema.';

-- ── 7. RLS: mismo patrón que torneo_partidos ───────────────────────────────
-- Lectura para cualquiera del club, escritura solo para el admin del club.
ALTER TABLE public.torneo_equipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "torneo_equipos_select" ON public.torneo_equipos;
CREATE POLICY "torneo_equipos_select" ON public.torneo_equipos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
  );
DROP POLICY IF EXISTS "torneo_equipos_admin_all" ON public.torneo_equipos;
CREATE POLICY "torneo_equipos_admin_all" ON public.torneo_equipos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  );

ALTER TABLE public.torneo_equipos_cabezas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "torneo_equipos_cabezas_select" ON public.torneo_equipos_cabezas;
CREATE POLICY "torneo_equipos_cabezas_select" ON public.torneo_equipos_cabezas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
  );
DROP POLICY IF EXISTS "torneo_equipos_cabezas_admin_all" ON public.torneo_equipos_cabezas;
CREATE POLICY "torneo_equipos_cabezas_admin_all" ON public.torneo_equipos_cabezas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  );

ALTER TABLE public.torneo_encuentros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "torneo_encuentros_select" ON public.torneo_encuentros;
CREATE POLICY "torneo_encuentros_select" ON public.torneo_encuentros
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
  );
DROP POLICY IF EXISTS "torneo_encuentros_admin_all" ON public.torneo_encuentros;
CREATE POLICY "torneo_encuentros_admin_all" ON public.torneo_encuentros
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = public.get_my_club_id())
    AND public.get_my_rol() = 'admin'
  );

-- Los integrantes cuelgan del equipo, así que el filtro de club va con un salto
-- más: equipo → torneo → club.
ALTER TABLE public.torneo_equipo_jugadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "torneo_equipo_jugadores_select" ON public.torneo_equipo_jugadores;
CREATE POLICY "torneo_equipo_jugadores_select" ON public.torneo_equipo_jugadores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torneo_equipos e
      JOIN public.torneos t ON t.id = e.torneo_id
      WHERE e.id = equipo_id AND t.club_id = public.get_my_club_id()
    )
  );
DROP POLICY IF EXISTS "torneo_equipo_jugadores_admin_all" ON public.torneo_equipo_jugadores;
CREATE POLICY "torneo_equipo_jugadores_admin_all" ON public.torneo_equipo_jugadores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.torneo_equipos e
      JOIN public.torneos t ON t.id = e.torneo_id
      WHERE e.id = equipo_id AND t.club_id = public.get_my_club_id()
    ) AND public.get_my_rol() = 'admin'
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torneo_equipos e
      JOIN public.torneos t ON t.id = e.torneo_id
      WHERE e.id = equipo_id AND t.club_id = public.get_my_club_id()
    ) AND public.get_my_rol() = 'admin'
  );

-- ── 8. Comprobaciones ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_tablas integer;
  v_columnas integer;
  v_rls integer;
BEGIN
  SELECT count(*) INTO v_tablas
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('torneo_equipos', 'torneo_equipo_jugadores',
                       'torneo_equipos_cabezas', 'torneo_encuentros');
  IF v_tablas <> 4 THEN
    RAISE EXCEPTION 'Faltan tablas de equipos (encontradas: %)', v_tablas;
  END IF;

  -- Las columnas nuevas TIENEN que ser nullable: es lo que deja intacta
  -- cualquier consulta que hoy lee torneo_partidos.
  SELECT count(*) INTO v_columnas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'torneo_partidos'
    AND column_name IN ('encuentro_id', 'jugador_a2', 'jugador_b2', 'numero_en_encuentro')
    AND is_nullable = 'YES';
  IF v_columnas <> 4 THEN
    RAISE EXCEPTION 'Las columnas de equipos no quedaron nullable (encontradas: %)', v_columnas;
  END IF;

  SELECT count(*) INTO v_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('torneo_equipos', 'torneo_equipo_jugadores',
                      'torneo_equipos_cabezas', 'torneo_encuentros')
    AND rowsecurity = true;
  IF v_rls <> 4 THEN
    RAISE EXCEPTION 'Alguna tabla de equipos quedó sin RLS (con RLS: %)', v_rls;
  END IF;

  RAISE NOTICE 'Comprobado: 4 tablas con RLS y 4 columnas nullable en torneo_partidos.';
END $$;

COMMIT;
