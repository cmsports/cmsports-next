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
-- ⚠️ MIGRACIÓN ANULADA — NO VOLVER A EJECUTAR ⚠️
--
-- Esta migración ya se ejecutó y NO debe correrse nunca más. Se corrió dos
-- veces, y la segunda vez destruyó datos reales de producción sin respaldo.
-- Qué falló:
--
--   1. La premisa era falsa. Dice "lo que había era de las pruebas previas al
--      lanzamiento", pero la plataforma se le entregó al club el 27 de julio
--      de 2026: todo lo cargado desde esa fecha era real.
--
--   2. Borra más de lo que promete. El comentario dice que los movimientos que
--      no vienen de una mensualidad no se tocan, pero la condición incluye
--      `mes_correspondiente IS NOT NULL`, que barre con sueldos e ingresos
--      manuales. Así se perdió un ingreso de $3.191.300 y dos sueldos.
--
--   3. El respaldo falla en silencio al repetirse. `CREATE TABLE IF NOT EXISTS`
--      no hace nada si la tabla ya existe, pero el DELETE de más abajo corre
--      igual: la segunda pasada borró sin copia de seguridad.
--
-- Lo borrado el 28-29 de julio se pudo recuperar solo porque
-- `registrar_movimiento_financiero_atomico` guarda el monto en `audit_log` al
-- crear cada movimiento. Sin eso, esa plata no se recuperaba.
--
-- La guarda de abajo aborta la ejecución. No la quites: si alguna vez hace
-- falta un reseteo, se escribe una migración nueva siguiendo las reglas de
-- docs/migraciones-destructivas.md.

DO $$
BEGIN
  RAISE EXCEPTION 'Migración 089 anulada: ya se ejecutó y destruyó datos reales al repetirse. Ver el encabezado del archivo y docs/migraciones-destructivas.md';
END $$;

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
