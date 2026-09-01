-- ────────────────────────────────────────────────────────────
-- Completa `asistencia.bloque_id` para lo viejo, una sola vez.
--
-- Este cambio afecta a: Asociación TDM Buin y Paine.
--
-- ── Por qué hace falta ─────────────────────────────────────────────────────
-- La migración 242 le agregó `bloque_id` a `asistencia` y puso a la pantalla
-- a guardarlo desde ahora. Pero "desde ahora" es literal: hasta que alguien
-- vuelva a marcar presente, TODA la asistencia vieja sigue con `bloque_id`
-- en NULL — cientos de días de historial real, sin el dato.
--
-- `Por bloque` en Panorama, a propósito, no mezcla lo confirmado con lo
-- adivinado por defecto (para no hacer dudar de todo el reporte), así que
-- con cero filas confirmadas se veía vacío en todos lados aunque la
-- asistencia se hubiera pasado miles de veces. El "modo inferido" sigue
-- estando en la pantalla, pero completar la base de una vez es mejor que
-- dejar que cada consulta lo recalcule siempre desde cero.
--
-- ── Cómo decide a qué bloque asignar cada fila ────────────────────────────
-- La misma regla que ya usa `historialAsistencia.ts` en el código: para cada
-- asistencia sin bloque, busca en qué bloque estaba inscrito ese jugador
-- (`bloque_jugadores`, vigente ESE día) cuyo día de la semana coincida con la
-- fecha de la asistencia.
--
-- Si hay más de un bloque candidato (el jugador tenía dos grupos el mismo
-- día de la semana), esa fila NO se toca — se queda en NULL, como hoy. No
-- hay forma de saber a cuál de los dos fue, y adivinar mal sería peor que no
-- decir nada. Estas quedan igual de "recuperables" para siempre por el
-- modo inferido de la pantalla.
--
-- ── Qué NO hace ────────────────────────────────────────────────────────────
-- Ninguna fila con `bloque_id` ya puesto se toca (el `WHERE bloque_id IS
-- NULL` de más abajo). Ninguna fila 'ausente' se toca (solo 'presente' tiene
-- sentido asignarle un bloque). No se borra ni se inventa una fila: solo se
-- completa una columna que hoy está vacía.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('243_backfill_asistencia_bloque');

-- ══ 1. Estado antes, para poder comparar ═════════════════════════════════
DO $$
DECLARE v_total integer; v_sin_bloque integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE bloque_id IS NULL)
    INTO v_total, v_sin_bloque
  FROM asistencia
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND estado = 'presente';
  RAISE NOTICE 'Presentes: % totales, % sin bloque antes de completar', v_total, v_sin_bloque;
END $$;

-- ══ 2. Completar, solo donde no hay ambigüedad ════════════════════════════
WITH candidatos AS (
  SELECT
    a.id AS asistencia_id,
    bj.bloque_id,
    count(*) OVER (PARTITION BY a.id) AS n_candidatos
  FROM asistencia a
  JOIN bloque_jugadores bj ON bj.jugador_id = a.jugador_id
  JOIN bloques_horario b ON b.id = bj.bloque_id
  WHERE a.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND a.estado = 'presente'
    AND a.bloque_id IS NULL
    AND b.dia_semana = (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[extract(dow from a.fecha)::int + 1]
    AND bj.vigente_desde <= a.fecha
    AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= a.fecha)
),
unicos AS (
  SELECT asistencia_id, bloque_id FROM candidatos WHERE n_candidatos = 1
)
UPDATE asistencia a
SET bloque_id = u.bloque_id
FROM unicos u
WHERE a.id = u.asistencia_id AND a.bloque_id IS NULL;

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────

-- 1) Cuántas quedaron completadas y cuántas siguen sin bloque (ambiguas, o
--    sin ningún bloque candidato — por ejemplo, alguien que entrenaba en un
--    bloque que ya no existe).
SELECT
  count(*) FILTER (WHERE bloque_id IS NOT NULL) AS con_bloque,
  count(*) FILTER (WHERE bloque_id IS NULL) AS sin_bloque,
  count(*) AS total
FROM asistencia
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND estado = 'presente';

-- 2) Una muestra de lo que quedó sin completar, para revisar a mano si vale
--    la pena — típicamente jugadores con dos bloques el mismo día, o
--    entrenamientos de un bloque que ya se dio de baja.
SELECT a.jugador_id, a.fecha,
  (ARRAY['dom','lun','mar','mie','jue','vie','sab'])[extract(dow from a.fecha)::int + 1] AS dia
FROM asistencia a
WHERE a.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND a.estado = 'presente' AND a.bloque_id IS NULL
ORDER BY a.fecha DESC
LIMIT 20;
