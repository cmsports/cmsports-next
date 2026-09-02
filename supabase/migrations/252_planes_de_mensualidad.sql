-- ────────────────────────────────────────────────────────────
-- Planes de mensualidad: la cuota sale de una tarifa, no de un monto suelto.
--
-- Este cambio afecta a: TODOS los clubes en cuanto al ESQUEMA, pero el
-- comportamiento **solo cambia para quien ponga `mensualidad.modo = por_plan`**.
-- El default es `monto_libre`, así que Buin emite exactamente igual que hoy.
--
-- ══ Por qué Buin NO quiere esto y Spinhouse sí ════════════════════════════
--
-- `mensualidades.ts` lo explica, y tiene razón:
--
--   "El profe define cada cuota a mano —hay de $7.000, de $30.000, de
--    $50.000— y ninguna tabla puede adivinarlas."
--
-- Eso es cierto para Buin, donde la cuota es un acuerdo por persona. En
-- Spinhouse no: la cuota sale de una tarifa publicada, frecuencia semanal por
-- tipo de clase. Eso sí es una tabla, y mantenerlo a mano en 140 fichas
-- garantiza que se desactualice.
--
-- ══ La regla que impide inventar plata ════════════════════════════════════
--
-- Si el club está en `por_plan` y un jugador no tiene plan asignado, su
-- mensualidad nace **sin monto**, igual que hoy. No cae a un valor "razonable"
-- ni al plan más barato. Un monto inventado se ve igual de real que uno
-- correcto, así que nadie lo revisa y termina cobrado — es la lección de la
-- migración 097 y no se toca.
--
-- ══ Los valores todavía no están ══════════════════════════════════════════
--
-- El club los entrega con el padrón. Esta migración crea la tabla VACÍA: sin
-- planes cargados, `por_plan` se comporta igual que `monto_libre`. Se cargan
-- desde la pantalla cuando lleguen.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('252_planes_de_mensualidad');
SELECT _migracion_para_todos_los_clubes(
  'crea la tabla de planes vacía y enseña a generar_mensualidades a leerla; sin planes cargados nada cambia');


-- ══ 1. Leer la configuración desde SQL ════════════════════════════════════
--
-- `configDelClub()` vive en TypeScript, pero `generar_mensualidades` corre en
-- Postgres y necesita saber en qué modo está el club. Esta es la misma lectura,
-- con la misma regla: clave ausente o valor raro = el default, que es el
-- comportamiento actual.
CREATE OR REPLACE FUNCTION public._config_texto(
  p_club_id uuid, p_clave text, p_default text
) RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT valor #>> '{}' FROM club_config
      WHERE club_id = p_club_id AND clave = p_clave),
    p_default
  );
$$;

COMMENT ON FUNCTION public._config_texto(uuid, text, text) IS
  'Lee una clave de club_config desde SQL. Espejo de configDelClub() en TypeScript: clave ausente = el default, que siempre es el comportamiento actual.';


-- ══ 2. Los planes ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.planes_club (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  nombre             text NOT NULL,
  frecuencia_semanal int,
  tipo_clase         text,
  monto              int  NOT NULL,
  -- Un plan que deja de venderse no se borra: los jugadores que lo tienen y
  -- las cuotas ya emitidas lo referencian. Misma semántica que en el resto del
  -- proyecto — `vigente_hasta` es el último día en que se vendió, inclusive.
  vigente_desde      date,
  vigente_hasta      date,
  activo             boolean NOT NULL DEFAULT true,
  creado_en          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planes_club_monto_valido CHECK (monto >= 0),
  CONSTRAINT planes_club_frecuencia   CHECK (frecuencia_semanal IS NULL OR frecuencia_semanal BETWEEN 1 AND 7),
  CONSTRAINT planes_club_vigencia     CHECK (vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE INDEX IF NOT EXISTS planes_club_club_idx ON public.planes_club (club_id, activo);

COMMENT ON TABLE public.planes_club IS
  'Tarifas de mensualidad de un club: frecuencia semanal × tipo de clase → monto. Solo se usa cuando club_config dice mensualidad.modo = por_plan.';


-- ══ 3. El plan de cada jugador ════════════════════════════════════════════
--
-- Nullable, y con ON DELETE SET NULL: borrar un plan no puede borrar jugadores.
-- Un jugador sin plan en un club por_plan emite sin monto, que es lo correcto:
-- es visible en la pantalla y alguien lo corrige, en vez de cobrarle de más.
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.planes_club(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jugadores_plan_idx ON public.jugadores (plan_id);

COMMENT ON COLUMN public.jugadores.plan_id IS
  'Plan contratado. NULL = sin plan; en un club por_plan su cuota nace sin monto en vez de inventarse una.';


-- ══ 4. Quién ve y quién escribe ═══════════════════════════════════════════
-- Lectura para cualquiera del club: el alumno tiene que poder ver qué plan
-- tiene y cuánto vale. Escritura solo admin — es plata.
ALTER TABLE public.planes_club ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planes_club_lectura" ON public.planes_club;
CREATE POLICY "planes_club_lectura" ON public.planes_club
  FOR SELECT
  USING (club_id = get_my_club_id() OR get_my_rol() = 'superadmin');

DROP POLICY IF EXISTS "planes_club_escritura" ON public.planes_club;
CREATE POLICY "planes_club_escritura" ON public.planes_club
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin'));


-- ══ 5. generar_mensualidades aprende a leer el plan ═══════════════════════
--
-- El único cambio respecto de la 210 es de dónde sale el monto. Todo lo demás
-- —los chequeos de autenticación, el filtro de activos y no externos, el
-- `not exists` que evita duplicar— queda igual.
CREATE OR REPLACE FUNCTION generar_mensualidades(p_club_id uuid, p_mes integer, p_anio integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_insertados int := 0;
  v_modo       text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (
    get_my_rol() = 'superadmin'
    or (get_my_rol() = 'admin' and p_club_id = get_my_club_id())
  ) then
    raise exception 'No autorizado';
  end if;

  v_modo := _config_texto(p_club_id, 'mensualidad.modo', 'monto_libre');

  insert into mensualidades (club_id, jugador_id, mes, anio, estado, monto)
  select
    p_club_id,
    j.id,
    p_mes,
    p_anio,
    'pendiente',
    case
      -- Con planes: la tarifa del plan, y si no tiene plan cae a su monto
      -- propio. Si no tiene ninguno de los dos, nace SIN MONTO — nunca un
      -- valor inventado (migración 097).
      when v_modo = 'por_plan' then coalesce(pl.monto, j.mensualidad)
      -- Sin planes: exactamente como hasta hoy.
      else j.mensualidad
    end
  from jugadores j
  left join planes_club pl
    on v_modo = 'por_plan'
   and pl.id = j.plan_id
   and pl.club_id = p_club_id
  where j.club_id = p_club_id
    and j.estado = 'activo'
    and (j.es_externo is null or j.es_externo = false)
    and not exists (
      select 1 from mensualidades m
      where m.jugador_id = j.id
        and m.club_id = p_club_id
        and m.mes = p_mes
        and m.anio = p_anio
    );

  get diagnostics v_insertados = row_count;

  return json_build_object(
    'club_id', p_club_id,
    'mes', p_mes,
    'anio', p_anio,
    'modo', v_modo,
    'mensualidades_creadas', v_insertados
  );
end;
$$;

REVOKE ALL ON FUNCTION public.generar_mensualidades(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_mensualidades(uuid, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public._config_texto(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._config_texto(uuid, text, text) TO authenticated;


-- ══ 6. Realtime ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'planes_club'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.planes_club;
  END IF;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) La tabla nació vacía: ningún club tiene planes, así que ninguno cambió.
-- SELECT count(*) AS planes FROM planes_club;

-- 2) Ningún jugador tiene plan asignado.
-- SELECT count(*) FILTER (WHERE plan_id IS NULL)     AS sin_plan,
--        count(*) FILTER (WHERE plan_id IS NOT NULL) AS con_plan
-- FROM jugadores;

-- 3) Todos los clubes siguen en monto libre.
-- SELECT c.nombre, _config_texto(c.id, 'mensualidad.modo', 'monto_libre') AS modo
-- FROM clubes c ORDER BY c.nombre;

-- 4) El lector de configuración responde bien.
-- SELECT _config_texto(
--   (SELECT id FROM clubes WHERE nombre = 'Spinhouse'),
--   'clave.que.no.existe', 'el default') = 'el default' AS cae_al_default;
