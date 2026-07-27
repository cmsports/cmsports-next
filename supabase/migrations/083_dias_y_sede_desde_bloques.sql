-- Los días que entrena y la sede pasan a derivarse de los bloques.
--
-- Quedaban dos verdades sobre lo mismo. Los campos `entrena_lun..vie` y `sede`
-- vienen de antes de este trabajo y nunca se actualizaron; `bloque_jugadores`
-- viene de la planilla CUPOS JULIO, es día por día y ya se validó con el profe.
--
-- Que difieran no es teórico: Edison Muñoz tenía marcado lunes cuando el profe
-- dijo miércoles y viernes, y once jugadores que entrenan en las dos sedes
-- figuraban solo en Paine. La pantalla de Inasistencias calcula las faltas
-- contra esos campos, así que hoy acusa faltas de días que no existen.
--
-- Después de esto el bloque manda y los campos son un reflejo. Se conservan
-- porque cinco pantallas todavía los leen (jugadores, finanzas, reportes,
-- asistencia e inasistencias).
--
-- Los jugadores sin ningún bloque no se tocan.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 0. Copia de seguridad ─────────────────────────────────────────────────
-- Queda como tabla en la base. Si algo sale mal, los valores viejos están acá.
CREATE TABLE IF NOT EXISTS _respaldo_dias_sede_083 AS
SELECT id, nombre, sede, horario,
       entrena_lun, entrena_mar, entrena_mie, entrena_jue, entrena_vie,
       now() AS respaldado_en
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- ── 1. Qué dicen los bloques de cada jugador ──────────────────────────────
CREATE TEMP TABLE _desde_bloques AS
SELECT bj.jugador_id,
       bool_or(b.dia_semana = 'lun') AS lun,
       bool_or(b.dia_semana = 'mar') AS mar,
       bool_or(b.dia_semana = 'mie') AS mie,
       bool_or(b.dia_semana = 'jue') AS jue,
       bool_or(b.dia_semana = 'vie') AS vie,
       bool_or(b.sede = 'buin')      AS en_buin,
       bool_or(b.sede = 'paine')     AS en_paine
FROM bloque_jugadores bj
JOIN bloques_horario b ON b.id = bj.bloque_id AND b.activo = true
WHERE b.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
GROUP BY bj.jugador_id;

-- ── 2. Sincronizar días y sede ────────────────────────────────────────────
-- Quien tiene bloques en las dos sedes queda como 'ambos', que es el valor que
-- el resto del sistema ya entiende (entrenaEnSede lo cuenta en los dos filtros).
UPDATE jugadores j SET
  entrena_lun = d.lun,
  entrena_mar = d.mar,
  entrena_mie = d.mie,
  entrena_jue = d.jue,
  entrena_vie = d.vie,
  sede = CASE
           WHEN d.en_buin AND d.en_paine THEN 'ambos'
           WHEN d.en_buin                THEN 'buin'
           ELSE                               'paine'
         END
FROM _desde_bloques d
WHERE d.jugador_id = j.id
  AND j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- ── 3. El historial vigente tiene que decir lo mismo ──────────────────────
-- Inasistencias consulta el historial para saber qué días entrenaba alguien en
-- una fecha dada. Si el tramo abierto queda con los días viejos, seguiría
-- calculando faltas contra los datos que acabamos de corregir.
UPDATE jugador_horario_historial h SET
  entrena_lun = d.lun, entrena_mar = d.mar, entrena_mie = d.mie,
  entrena_jue = d.jue, entrena_vie = d.vie
FROM _desde_bloques d
WHERE d.jugador_id = h.jugador_id
  AND h.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND h.vigente_hasta IS NULL;

COMMIT;


-- ── Verificación 1: no debe devolver ninguna fila ─────────────────────────
-- Es la misma consulta de descuadres. Ahora que los días salen del bloque,
-- cualquier fila acá sería un error real.
WITH jug AS (
  SELECT j.id, j.nombre, j.sede,
         j.entrena_lun, j.entrena_mar, j.entrena_mie, j.entrena_jue, j.entrena_vie
  FROM jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND j.estado = 'activo'
    AND (j.es_externo IS NULL OR j.es_externo = false)
),
dias AS (
  SELECT j.id, j.nombre, d.dia
  FROM jug j
  CROSS JOIN LATERAL (VALUES
    ('lun', j.entrena_lun), ('mar', j.entrena_mar), ('mie', j.entrena_mie),
    ('jue', j.entrena_jue), ('vie', j.entrena_vie)
  ) AS d(dia, entrena)
  WHERE d.entrena = true
),
asig AS (
  SELECT bj.jugador_id, b.dia_semana, b.sede, b.nombre AS bloque
  FROM bloque_jugadores bj
  JOIN bloques_horario b ON b.id = bj.bloque_id
)
SELECT 'Entrena ese día pero no está en ningún bloque' AS problema,
       d.nombre, d.dia AS detalle, NULL AS bloque
FROM dias d
WHERE NOT EXISTS (SELECT 1 FROM asig a WHERE a.jugador_id = d.id AND a.dia_semana = d.dia)
UNION ALL
SELECT 'Está en un bloque un día que no entrena', j.nombre, a.dia_semana, a.bloque
FROM asig a JOIN jug j ON j.id = a.jugador_id
WHERE NOT EXISTS (SELECT 1 FROM dias d WHERE d.id = j.id AND d.dia = a.dia_semana)
UNION ALL
SELECT 'Sede del bloque distinta a la del jugador', j.nombre,
       j.sede || ' -> ' || a.sede, a.bloque
FROM asig a JOIN jug j ON j.id = a.jugador_id
WHERE a.sede <> j.sede AND j.sede <> 'ambos'
ORDER BY 1, 2;


-- ── Verificación 2: cómo quedó repartida la gente ─────────────────────────
SELECT sede, count(*) AS jugadores
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND estado = 'activo' AND (es_externo IS NULL OR es_externo = false)
GROUP BY sede ORDER BY sede;
