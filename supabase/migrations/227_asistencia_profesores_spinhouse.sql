-- ────────────────────────────────────────────────────────────
-- Los profesores marcan que estuvieron, para contabilizar horas trabajadas.
--
-- Este cambio afecta a: Spinhouse (2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41).
-- La tabla existe para todos, pero la pestaña se enciende con el módulo
-- `asistencia_profes`, y esta migración solo se lo activa a Spinhouse.
--
-- Qué agrega, y qué NO. `PanelReportes` ya calcula las horas de cada profesor
-- del mes, pero las calcula desde `bloque_profesores`: son las horas que le
-- TOCABA dictar, descontando los días suspendidos. Eso es el plan. Lo que
-- Spinhouse pidió es lo otro —"que efectivamente fueron a clases"—, y eso nadie
-- lo estaba registrando. Esta tabla guarda el hecho, no el plan. El reporte
-- viejo sigue igual: son dos números distintos y los dos sirven.
--
-- Puede haber dos profesores en el mismo bloque y cada uno marca la suya: por
-- eso la clave es (profesor, bloque, fecha) y no (bloque, fecha).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('227_asistencia_profesores_spinhouse');

-- ══ 1. Qué profesor es quien está mirando ═════════════════════════════════
-- El vínculo entre `perfiles` y `profesores` es el correo: así lo dejan
-- `crearProfesor` y `crearAccesoProfesor`, que escriben el mismo valor en los
-- dos lados. No es una FK y por eso puede romperse si alguien cambia un correo
-- por un costado, pero es lo que ya existe y duplicar el vínculo sería peor.
--
-- Vive en una función para que la regla esté en UN lugar: el día que
-- `profesores` gane una columna `perfil_id`, se cambia acá y nada más.
CREATE OR REPLACE FUNCTION public.get_my_profesor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT p.id
  FROM profesores p
  JOIN perfiles pe ON pe.id = auth.uid()
  WHERE p.club_id = pe.club_id
    AND pe.rol = 'profesor'
    AND p.email IS NOT NULL
    AND lower(p.email) = lower(pe.email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profesor_id() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_profesor_id() TO authenticated;


-- ══ 2. La tabla ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.asistencia_profesores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES public.clubes(id)          ON DELETE CASCADE,
  profesor_id    uuid NOT NULL REFERENCES public.profesores(id)      ON DELETE CASCADE,
  bloque_id      uuid NOT NULL REFERENCES public.bloques_horario(id) ON DELETE CASCADE,
  fecha          date NOT NULL,

  -- La hora en que marcó. En hora de Chile: el DEFAULT `now()` a secas guarda
  -- UTC y de noche muestra la marca en el día siguiente.
  hora           time NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::time,

  -- Quién apretó el botón. Sirve para distinguir el profe que se marcó solo del
  -- que marcó el admin por él.
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asistencia_profesores_unica UNIQUE (profesor_id, bloque_id, fecha)
);

CREATE INDEX IF NOT EXISTS asistencia_profes_club_fecha_idx
  ON public.asistencia_profesores (club_id, fecha);
CREATE INDEX IF NOT EXISTS asistencia_profes_profesor_idx
  ON public.asistencia_profesores (profesor_id, fecha);

COMMENT ON TABLE public.asistencia_profesores IS
  'El profesor estuvo en ese bloque ese día. Es el hecho; las horas que le tocaba dictar salen de bloque_profesores (PanelReportes).';


-- ══ 3. Quién ve y quién escribe ═══════════════════════════════════════════
ALTER TABLE public.asistencia_profesores ENABLE ROW LEVEL SECURITY;

-- Todo el staff del club lo lee: el admin para contabilizar, el profe para ver
-- lo suyo y lo del compañero con quien comparte bloque.
DROP POLICY IF EXISTS "asis_profes_lectura" ON public.asistencia_profesores;
CREATE POLICY "asis_profes_lectura" ON public.asistencia_profesores
  FOR SELECT USING (
    club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin','profesor')
  );

-- El admin marca por cualquiera: es quien corrige el olvido del día anterior.
DROP POLICY IF EXISTS "asis_profes_admin" ON public.asistencia_profesores;
CREATE POLICY "asis_profes_admin" ON public.asistencia_profesores
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin'))
  WITH CHECK (
    club_id = get_my_club_id() AND get_my_rol() IN ('admin','superadmin')
    -- Nadie estuvo en una clase que todavía no ocurrió. Va en el WITH CHECK y
    -- no en un CHECK de tabla porque `now()` no es inmutable y Postgres no la
    -- acepta en una restricción de columna.
    AND fecha <= (now() AT TIME ZONE 'America/Santiago')::date
  );

-- El profesor marca la suya y solo la suya.
DROP POLICY IF EXISTS "asis_profes_propia" ON public.asistencia_profesores;
CREATE POLICY "asis_profes_propia" ON public.asistencia_profesores
  FOR ALL
  USING      (club_id = get_my_club_id() AND profesor_id = get_my_profesor_id())
  WITH CHECK (
    club_id = get_my_club_id()
    AND profesor_id = get_my_profesor_id()
    AND fecha <= (now() AT TIME ZONE 'America/Santiago')::date
    -- Y en un bloque de su club. Sin esto podía marcarse en el bloque de otro
    -- club y meterse horas en un reporte ajeno.
    AND EXISTS (
      SELECT 1 FROM bloques_horario b
      WHERE b.id = bloque_id AND b.club_id = get_my_club_id()
    )
  );


-- ══ 4. Realtime ═══════════════════════════════════════════════════════════
-- Dos profes en el mismo bloque, cada uno con su teléfono: si esto falta, el
-- primero no ve que el segundo ya marcó.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'asistencia_profesores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.asistencia_profesores;
  END IF;
END $$;


-- ══ 5. El módulo, solo para Spinhouse ═════════════════════════════════════
UPDATE clubes
SET modulos_habilitados =
  array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'asistencia_profes')
WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND NOT ('asistencia_profes' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Espera solo Spinhouse:
-- SELECT nombre FROM clubes WHERE 'asistencia_profes' = ANY(modulos_habilitados);
--
-- Espera 'asistencia_profesores':
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'asistencia_profesores';
--
-- Espera 3 políticas:
-- SELECT policyname FROM pg_policies WHERE tablename = 'asistencia_profesores';
--
-- CUÁLES PROFES VAN A PODER MARCARSE. Los que no aparezcan acá tienen el correo
-- distinto entre su ficha y su cuenta, y get_my_profesor_id() les va a devolver
-- NULL: van a ver la pestaña pero el botón les va a fallar. Revisar antes de
-- avisarle al club que ya pueden usarlo.
--
-- SELECT p.nombre, p.email AS email_ficha, pe.email AS email_cuenta,
--        (pe.id IS NOT NULL) AS puede_marcarse
-- FROM profesores p
-- LEFT JOIN perfiles pe
--   ON pe.club_id = p.club_id AND pe.rol = 'profesor'
--   AND lower(pe.email) = lower(p.email)
-- WHERE p.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' AND p.activo
-- ORDER BY p.nombre;
