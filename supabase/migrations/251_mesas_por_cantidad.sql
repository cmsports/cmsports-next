-- ────────────────────────────────────────────────────────────
-- Las mesas son un NÚMERO, no una lista.
--
-- Este cambio afecta a: Spinhouse. Ningún otro club tiene el módulo `mesas`
-- encendido ni una sola fila en estas tablas.
--
-- ══ Por qué se rehace lo que la 249 acababa de crear ══════════════════════
--
-- La 249 modeló cada mesa como una fila y cada bloque como una lista de mesas
-- concretas: "Adultos del martes usa la 3, la 7 y la 9". Eso está mal por dos
-- razones, y las dos las dijo el club:
--
--   1. **Nadie va a hacer ese trabajo.** Asignar mesas concretas a cada bloque
--      de cada día es media hora de clicks para una información que no se usa:
--      el profe le dice al alumno a qué mesa ir estando en la sala.
--
--   2. **No es lo que se pidió.** El formulario dice, textual: "el cupo de cada
--      bloque depende DEL NÚMERO de mesas disponibles en la sede". Del número,
--      no de cuáles.
--
-- El modelo correcto es el que el club ya tiene en la cabeza: la sede tiene 12
-- mesas, Adultos usa 5, Menores usa 3, y a las 19:00 no puede haber más de 12
-- ocupadas entre todo lo que se solape.
--
-- ══ Qué se pierde ═════════════════════════════════════════════════════════
--
-- La capacidad de decir "tu clase es en la mesa 3". El club no la pidió y la
-- resuelve hablando. Si algún día hiciera falta, se agrega encima de esto sin
-- deshacerlo: una lista de mesas concretas es un detalle de una cantidad, no
-- al revés.
--
-- ══ Lo que se borra, contado antes de escribir esto ═══════════════════════
--
--   sede_mesas       12 filas — las creó el seed de prueba el 2026-09-02 09:58
--   bloque_mesas      0 filas — nunca se usó
--   mesa_arriendos    0 filas — nunca se usó
--
-- No hay ni un dato del club. Aun así va con respaldo, porque la regla de
-- `docs/migraciones-destructivas.md` no distingue: la 089 también creía que
-- borraba datos de prueba.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('251_mesas_por_cantidad');
SELECT _migracion_para_club('Spinhouse');


-- ══ 1. El respaldo ════════════════════════════════════════════════════════
-- Nombre único y SIN `IF NOT EXISTS`: si esta migración se pegara dos veces,
-- el CREATE falla con "relation already exists" y aborta la transacción entera
-- antes de borrar nada. El error es la protección (regla 1).
CREATE TABLE _respaldo_mesas_251_20260902 AS
  SELECT * FROM public.sede_mesas;

CREATE TABLE _respaldo_bloque_mesas_251_20260902 AS
  SELECT * FROM public.bloque_mesas;

CREATE TABLE _respaldo_mesa_arriendos_251_20260902 AS
  SELECT * FROM public.mesa_arriendos;


-- ══ 2. Fuera lo viejo ═════════════════════════════════════════════════════
-- CASCADE en `sede_mesas` porque las otras dos la referencian; igual se dropean
-- las tres, así que no arrastra nada que no se vaya a ir.
DROP TABLE IF EXISTS public.bloque_mesas;
DROP TABLE IF EXISTS public.mesa_arriendos;
DROP TABLE IF EXISTS public.sede_mesas CASCADE;


-- ══ 3. La sede y su cantidad de mesas ═════════════════════════════════════
-- Una fila por sede. Es el número que el club ve escrito en la pared.
CREATE TABLE public.sede_mesas (
  club_id        uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  sede           text NOT NULL,
  cantidad       int  NOT NULL,
  notas          text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (club_id, sede),
  CONSTRAINT sede_mesas_cantidad_valida CHECK (cantidad >= 0 AND cantidad <= 200)
);

COMMENT ON TABLE public.sede_mesas IS
  'Cuántas mesas tiene cada sede. Una fila por sede, no una por mesa: el cupo depende del NÚMERO, y asignar mesas concretas a cada bloque es trabajo que nadie hace.';


-- ══ 4. Cuántas mesas usa cada bloque ══════════════════════════════════════
--
-- Nullable a propósito, y eso es lo que deja a Buin intacto: `NULL` significa
-- "este bloque no usa el modelo de mesas" y su cupo sigue saliendo de
-- `cupo_maximo`, exactamente como hasta hoy. Un default de 0 habría dejado a
-- todos los bloques de todos los clubes en cupo cero apenas alguien encendiera
-- el modo por mesas.
ALTER TABLE public.bloques_horario
  ADD COLUMN IF NOT EXISTS mesas int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bloques_horario_mesas_valida'
  ) THEN
    ALTER TABLE public.bloques_horario
      ADD CONSTRAINT bloques_horario_mesas_valida
      CHECK (mesas IS NULL OR (mesas >= 0 AND mesas <= 200));
  END IF;
END;
$$;

COMMENT ON COLUMN public.bloques_horario.mesas IS
  'Cuántas mesas ocupa este bloque. NULL = no usa el modelo de mesas y su cupo sale de cupo_maximo, que es el caso de todos los clubes salvo Spinhouse.';


-- ══ 5. Arriendo libre ═════════════════════════════════════════════════════
-- También por cantidad: al que arrienda le da igual cuál mesa le toca, y al
-- club lo que le importa es cuántas le quedan para clases.
CREATE TABLE public.mesa_arriendos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  sede          text NOT NULL,
  fecha         date NOT NULL,
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  mesas         int  NOT NULL,
  arrendatario  text,
  movimiento_id uuid REFERENCES public.movimientos(id) ON DELETE SET NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mesa_arriendos_rango  CHECK (hora_fin > hora_inicio),
  CONSTRAINT mesa_arriendos_mesas  CHECK (mesas > 0 AND mesas <= 200)
);

CREATE INDEX mesa_arriendos_club_fecha_idx
  ON public.mesa_arriendos (club_id, sede, fecha);

COMMENT ON TABLE public.mesa_arriendos IS
  'Mesas arrendadas a terceros. Compiten por el mismo recurso que las clases: lo arrendado no está disponible para un bloque que se solape.';


-- ══ 6. Quién ve y quién escribe ═══════════════════════════════════════════
-- Lectura para cualquiera del club; escritura solo admin. El profesor no
-- decide cuántas mesas tiene la sede.
ALTER TABLE public.sede_mesas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesa_arriendos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['sede_mesas', 'mesa_arriendos'] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_lectura" ON public.%I FOR SELECT
         USING (club_id = get_my_club_id() OR get_my_rol() = ''superadmin'')',
      v_tabla, v_tabla);

    EXECUTE format(
      'CREATE POLICY "%s_escritura" ON public.%I FOR ALL
         USING      (club_id = get_my_club_id() AND get_my_rol() IN (''admin'', ''superadmin''))
         WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN (''admin'', ''superadmin''))',
      v_tabla, v_tabla);
  END LOOP;
END;
$$;


-- ══ 7. Realtime ═══════════════════════════════════════════════════════════
-- Las tablas se dropearon, así que salieron de la publicación con ellas.
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['sede_mesas', 'mesa_arriendos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$$;


-- ══ 8. Spinhouse arranca con sus 12 ═══════════════════════════════════════
-- El número real todavía no está confirmado; es un punto de partida y se
-- cambia desde la pantalla. El `_migracion_para_club` de arriba garantiza que
-- esta fila no puede terminar en otro club.
INSERT INTO public.sede_mesas (club_id, sede, cantidad, notas)
SELECT id, 'spinhouse', 12, 'Punto de partida; confirmar el número real con el club'
FROM public.clubes WHERE nombre = 'Spinhouse'
ON CONFLICT (club_id, sede) DO NOTHING;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) El respaldo tiene las 12 filas viejas, por si acaso.
-- SELECT count(*) AS respaldadas FROM _respaldo_mesas_251_20260902;

-- 2) La sede quedó con su cantidad.
-- SELECT c.nombre, m.sede, m.cantidad
-- FROM sede_mesas m JOIN clubes c ON c.id = m.club_id;

-- 3) `bloque_mesas` ya no existe: esto DEBE fallar.
-- SELECT count(*) FROM bloque_mesas;

-- 4) Ningún bloque tiene mesas asignadas todavía, en NINGÚN club.
--    Todos en NULL = todos siguen usando cupo_maximo, o sea nada cambió.
-- SELECT count(*) FILTER (WHERE mesas IS NULL)     AS sin_mesas,
--        count(*) FILTER (WHERE mesas IS NOT NULL) AS con_mesas
-- FROM bloques_horario;

-- 5) Cuando ya no haga falta, los respaldos se sueltan a mano:
-- DROP TABLE _respaldo_mesas_251_20260902;
-- DROP TABLE _respaldo_bloque_mesas_251_20260902;
-- DROP TABLE _respaldo_mesa_arriendos_251_20260902;
