-- El jugador deja de poder ver quién entrena en cada grupo.
--
-- EL AGUJERO, QUE YA ESTÁ ABIERTO. La política de lectura de la 076 dice:
--
--   FOR SELECT USING (
--     EXISTS (SELECT 1 FROM bloques_horario b
--             WHERE b.id = bloque_id AND b.club_id = get_my_club_id())
--   )
--
-- Es decir: cualquiera del club lee TODAS las inscripciones. Un jugador con las
-- herramientas del navegador abiertas lista quién entrena en cada bloque, y
-- cruzándolo con `jugadores` les pone nombre. Esconderlo de la pantalla no
-- alcanza: el dato viaja igual.
--
-- Ahora el jugador solo ve las suyas. Al staff no le cambia nada.
--
-- POR QUÉ NO SE TOCA `bloques_horario`. Ahí vive el horario —nombre, día, hora,
-- sede—, que no dice quién va a cada uno. Es lo que el jugador necesita leer
-- para saber a dónde ir. Cerrarlo agregaría riesgo sin ganar privacidad.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- La de gestión ya es FOR ALL restringida a staff, así que el staff conserva su
-- lectura por ahí. Esta se reescribe entera igual, y no encimada: las políticas
-- de Postgres se suman con OR, así que dejar viva la vieja no restringiría nada.
DROP POLICY IF EXISTS "bloque_jug_lectura" ON bloque_jugadores;

CREATE POLICY "bloque_jug_lectura" ON bloque_jugadores
  FOR SELECT USING (
    -- Las propias: es lo que necesita para saber cuándo y dónde entrena.
    jugador_id = get_my_jugador_id()
    -- El staff sigue viendo las de todo su club.
    OR (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      AND EXISTS (
        SELECT 1 FROM bloques_horario b
        WHERE b.id = bloque_id AND b.club_id = get_my_club_id()
      )
    )
  );

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe quedar una sola política de lectura, y su definición tiene que
-- mencionar get_my_jugador_id(): eso es lo que la ata a las propias.
SELECT
  policyname,
  cmd,
  qual LIKE '%get_my_jugador_id%' AS limitada_a_las_propias
FROM pg_policies
WHERE tablename = 'bloque_jugadores'
ORDER BY policyname;
