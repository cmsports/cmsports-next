-- Baja definitiva de seis jugadores que el profe confirmó que ya no entrenan.
--
--   Luciano Enrique Colmenárez Liendo
--   Tomás Andrés Contreras Arancibia
--   José Tomás López Peys
--   Álvaro Moya Obregón
--   Alberto Andrés Vergara Sánchez
--   Jesús Enrique Colmenárez Argüello
--
-- ATENCIÓN: esto es irreversible. Se borra el jugador y, en cascada, su
-- asistencia, sus mensualidades, sus documentos y sus asignaciones de bloque.
-- Los movimientos de caja que ya se registraron en Finanzas NO se borran: son
-- del club, no del jugador, así que la contabilidad de junio y julio no cambia.
--
-- Hay varios apellidos repetidos en el club (dos Colmenárez, cuatro López, un
-- Contreras que se queda, un Moya que se queda), así que el emparejamiento es
-- por nombre completo y la migración se aborta si no encuentra exactamente
-- seis jugadores.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE TEMP TABLE _a_borrar AS
SELECT j.id, j.nombre, j.mensualidad, j.grupo, j.sede
FROM jugadores j
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND public._norm_nombre(j.nombre) IN (
    public._norm_nombre('Luciano Enrique Colmenarez Liendo'),
    public._norm_nombre('Tomás Andrés Contreras Arancibia'),
    public._norm_nombre('José Tomás Lopez Peys'),
    public._norm_nombre('Alvaro Moya Obregón'),
    public._norm_nombre('Alberto Andrés Vergara Sánchez'),
    public._norm_nombre('Jesus Enrique Colmenarez Arguello')
  );

-- Freno de mano: si no son exactamente seis, algo no calza y no se borra nada.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _a_borrar;
  IF n <> 6 THEN
    RAISE EXCEPTION 'Se esperaban 6 jugadores y se encontraron %. No se borró nada.', n;
  END IF;
END $$;

-- Se guarda lo que había, para dejar constancia en el informe final.
CREATE TEMP TABLE _resumen AS
SELECT
  b.nombre,
  b.grupo,
  b.sede,
  b.mensualidad,
  (SELECT count(*) FROM asistencia    a WHERE a.jugador_id = b.id) AS asistencias,
  (SELECT count(*) FROM mensualidades m WHERE m.jugador_id = b.id) AS cuotas
FROM _a_borrar b;

-- La cuenta de acceso primero: si se borra el jugador antes, se pierde el
-- vínculo y queda un usuario huérfano en el sistema de login.
DELETE FROM auth.users
WHERE id IN (SELECT p.id FROM perfiles p WHERE p.jugador_id IN (SELECT id FROM _a_borrar));

DELETE FROM perfiles WHERE jugador_id IN (SELECT id FROM _a_borrar);

DELETE FROM jugadores WHERE id IN (SELECT id FROM _a_borrar);

COMMIT;


-- ── Constancia de lo que se borró ─────────────────────────────────────────
SELECT * FROM _resumen ORDER BY nombre;
