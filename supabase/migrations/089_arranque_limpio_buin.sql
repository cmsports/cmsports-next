-- Deja Buin en cero para que el profe arranque de nuevo.
--
-- Lo que había era de las pruebas previas al lanzamiento:
--   · 53 asistencias del 30 de junio al 16 de julio
--   · 104 mensualidades de julio
--   · 45 movimientos cargados el 27 de julio
--
-- Se borran los tres. Antes de cada DELETE queda una copia completa en una
-- tabla de respaldo: si algo resulta haber sido real, se puede recuperar.
--
-- Solo se toca Buin. Los otros clubes de la base —Demostración TDM, Unión San
-- Bernardo, Paine— tienen sus propios datos y no se tocan.
--
-- Los movimientos que NO vienen de una mensualidad no se borran: si hay una
-- compra, un gasto o un pago de torneo cargado, es otra cosa y no es lo que se
-- pidió resetear. Al final se informa cuántos quedaron.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ Respaldos ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS _respaldo_asistencia_089 AS
SELECT * FROM asistencia
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

CREATE TABLE IF NOT EXISTS _respaldo_mensualidades_089 AS
SELECT * FROM mensualidades
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

CREATE TABLE IF NOT EXISTS _respaldo_movimientos_089 AS
SELECT * FROM movimientos
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';


-- ══ Asistencia ════════════════════════════════════════════════════════════
DELETE FROM asistencia
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- El contador sale del historial, que ahora está vacío. Recalcular en vez de
-- sumar y restar de a uno es lo que evita que este número se vaya desviando.
UPDATE jugadores SET sesiones_usadas = 0
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';


-- ══ Mensualidades y su plata ══════════════════════════════════════════════
-- Primero los movimientos que vienen de una cuota: si se borrara la cuota
-- antes, quedarían apuntando a una mensualidad que ya no existe.
DELETE FROM movimientos
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    mensualidad_id IS NOT NULL
    OR categoria IN ('mensualidad', 'mensualidades', 'ajuste_mensualidad')
    OR mes_correspondiente IS NOT NULL
  );

DELETE FROM mensualidades
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

COMMIT;


-- ── Verificación: todo en cero ────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM asistencia
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc')   AS asistencias,
  (SELECT count(*) FROM mensualidades
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc')   AS mensualidades,
  (SELECT count(*) FROM movimientos
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc')   AS movimientos_que_quedan,
  (SELECT count(*) FROM jugadores
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
      AND sesiones_usadas > 0)                                AS con_sesiones,
  (SELECT count(*) FROM jugadores
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
      AND estado = 'activo')                                  AS jugadores_activos;
