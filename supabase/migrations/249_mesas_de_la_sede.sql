-- ────────────────────────────────────────────────────────────
-- Las mesas de la sede, y el cupo derivado de ellas.
--
-- Este cambio afecta a: TODOS los clubes en cuanto al ESQUEMA —crea tres
-- tablas vacías—, pero en la práctica solo a quien encienda el módulo 'mesas'.
-- No toca ni una fila existente. Buin no tiene mesas cargadas ni el módulo
-- encendido, así que para Buin esto no existe.
--
-- ══ Qué pide el club ══════════════════════════════════════════════════════
--
--   "El cupo de cada bloque depende del número de mesas disponibles en la sede
--   y de la modalidad: máximo 4 jugadores por mesa en clases grupales, 1 o 2
--   por mesa en particulares, y las mesas destinadas a arriendo libre no
--   pueden asignarse a clases en el mismo horario. El sistema debe impedir
--   sobrepasar ese cupo."
--
-- ══ Por qué son tres tablas y no una columna ══════════════════════════════
--
-- La tentación es agregarle `mesas int` a `bloques_horario` y multiplicar. No
-- alcanza, porque el cupo no es lo único que hay que responder:
--
--   · "¿puedo abrir un grupo a las 19:00?"  → ¿quedan mesas libres A ESA HORA?
--   · "¿por qué no?"                        → ¿cuál mesa la tiene tomada?
--
-- Las dos preguntas son sobre SOLAPAMIENTO DE INTERVALOS, y para eso hace
-- falta saber qué mesa concreta usa cada bloque, no cuántas.
--
-- ══ vigente_desde / vigente_hasta y no un booleano `activa` ═══════════════
--
-- Misma razón que en `bloque_jugadores`: una mesa que se rompe a mitad de
-- semana tiene que dejar de contar DESDE ESA FECHA, sin borrar que antes
-- estaba. Un booleano no puede responder "¿cuántas mesas había el martes
-- pasado?", y esa pregunta la hace cualquier reporte de ocupación.
--
-- Ojo con la semántica, que en este proyecto ya mordió: `vigente_hasta` es el
-- ÚLTIMO DÍA EN QUE SIRVIÓ, inclusive. Para dar de baja una mesa hoy se
-- escribe AYER, no hoy.
--
-- Ver `docs/plan-spinhouse-maestro.md` §5.1 y `src/lib/domain/mesas.ts`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('249_mesas_de_la_sede');
SELECT _migracion_para_todos_los_clubes(
  'crea el esquema de mesas; las tres tablas quedan vacías y no toca filas de ningún club');


-- ══ 1. Las mesas ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sede_mesas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  sede          text NOT NULL,
  numero        int  NOT NULL,
  notas         text,
  vigente_desde date,
  vigente_hasta date,
  creado_en     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sede_mesas_numero_positivo CHECK (numero > 0),
  -- Una mesa no puede dejar de servir antes de existir.
  CONSTRAINT sede_mesas_vigencia_coherente
    CHECK (vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- "Mesa 3" tiene que ser una sola por sede: es como la llama el profe en voz
-- alta, y dos mesas 3 hacen que asignar la correcta sea imposible.
CREATE UNIQUE INDEX IF NOT EXISTS sede_mesas_numero_unico
  ON public.sede_mesas (club_id, sede, numero);

COMMENT ON TABLE public.sede_mesas IS
  'Las mesas físicas de una sede. El cupo de un bloque se deriva de cuántas tiene asignadas (ver club_config: cupos.modo).';
COMMENT ON COLUMN public.sede_mesas.vigente_hasta IS
  'Último día en que la mesa sirvió, INCLUSIVE. Para dar de baja hoy se escribe ayer.';


-- ══ 2. Qué mesa usa cada bloque ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bloque_mesas (
  bloque_id uuid NOT NULL REFERENCES public.bloques_horario(id) ON DELETE CASCADE,
  mesa_id   uuid NOT NULL REFERENCES public.sede_mesas(id)      ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubes(id)          ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (bloque_id, mesa_id)
);

-- `club_id` está repetido acá a propósito, aunque se podría deducir por el
-- bloque: sin la columna, la RLS tendría que hacer un JOIN en cada consulta y
-- el trigger de guardia de la migración 247 no podría vigilar esta tabla.
CREATE INDEX IF NOT EXISTS bloque_mesas_mesa_idx ON public.bloque_mesas (mesa_id);
CREATE INDEX IF NOT EXISTS bloque_mesas_club_idx ON public.bloque_mesas (club_id);

COMMENT ON TABLE public.bloque_mesas IS
  'Qué mesas ocupa cada bloque del horario semanal. De acá sale el cupo cuando el club usa cupos.modo = por_mesas.';


-- ══ 3. Arriendo libre ═════════════════════════════════════════════════════
--
-- Compite por el mismo recurso que las clases: una mesa arrendada de 19:00 a
-- 20:00 no está para la clase de 19:00 a 20:30. Por eso vive acá y no en
-- Finanzas — el movimiento de plata se enlaza, pero la ocupación es esto.
CREATE TABLE IF NOT EXISTS public.mesa_arriendos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubes(id)     ON DELETE CASCADE,
  mesa_id       uuid NOT NULL REFERENCES public.sede_mesas(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  arrendatario  text,
  -- El movimiento financiero, si se cobró. Nullable porque un arriendo puede
  -- reservarse antes de pagarse, y porque borrar un movimiento no puede
  -- borrar la ocupación de la mesa.
  movimiento_id uuid REFERENCES public.movimientos(id) ON DELETE SET NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mesa_arriendos_rango CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS mesa_arriendos_club_fecha_idx
  ON public.mesa_arriendos (club_id, fecha);
CREATE INDEX IF NOT EXISTS mesa_arriendos_mesa_fecha_idx
  ON public.mesa_arriendos (mesa_id, fecha);

COMMENT ON TABLE public.mesa_arriendos IS
  'Mesas arrendadas a terceros. Ocupan el mismo recurso que las clases: una mesa arrendada no se le puede asignar a un bloque que se solape.';


-- ══ 4. Quién ve y quién escribe ═══════════════════════════════════════════
--
-- Lectura para cualquiera del club: el alumno tiene que poder ver que su clase
-- es en la mesa 3. No hay nada sensible en un número de mesa.
--
-- Escritura solo admin. El profesor NO asigna mesas: es una decisión sobre el
-- recurso de la sede, del mismo orden que abrir o cerrar un horario, y la
-- matriz de permisos del plan lo deja del lado del admin.
ALTER TABLE public.sede_mesas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloque_mesas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesa_arriendos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['sede_mesas', 'bloque_mesas', 'mesa_arriendos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_lectura" ON public.%I', v_tabla, v_tabla);
    EXECUTE format(
      'CREATE POLICY "%s_lectura" ON public.%I FOR SELECT
         USING (club_id = get_my_club_id() OR get_my_rol() = ''superadmin'')',
      v_tabla, v_tabla);

    EXECUTE format('DROP POLICY IF EXISTS "%s_escritura" ON public.%I', v_tabla, v_tabla);
    EXECUTE format(
      'CREATE POLICY "%s_escritura" ON public.%I FOR ALL
         USING      (club_id = get_my_club_id() AND get_my_rol() IN (''admin'', ''superadmin''))
         WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN (''admin'', ''superadmin''))',
      v_tabla, v_tabla);
  END LOOP;
END;
$$;


-- ══ 5. Realtime ═══════════════════════════════════════════════════════════
-- Sin esto, `useEnVivo` sobre estas tablas se conecta, queda escuchando y no
-- llega nada nunca, sin dar error. Ya mordió dos veces (migraciones 121 y 142).
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['sede_mesas', 'bloque_mesas', 'mesa_arriendos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las tres tablas quedaron vacías. Tienen que dar 0.
--    Ese 0 es la garantía de que ningún club cambió de comportamiento.
-- SELECT
--   (SELECT count(*) FROM sede_mesas)     AS mesas,
--   (SELECT count(*) FROM bloque_mesas)   AS asignaciones,
--   (SELECT count(*) FROM mesa_arriendos) AS arriendos;

-- 2) Las seis políticas están (dos por tabla).
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('sede_mesas','bloque_mesas','mesa_arriendos')
-- ORDER BY tablename, policyname;

-- 3) Las tres están publicadas en realtime.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('sede_mesas','bloque_mesas','mesa_arriendos')
-- ORDER BY tablename;

-- 4) Buin no tiene el módulo encendido, así que no ve nada de esto.
-- SELECT nombre, 'mesas' = ANY(modulos_habilitados) AS tiene_mesas
-- FROM clubes ORDER BY nombre;
