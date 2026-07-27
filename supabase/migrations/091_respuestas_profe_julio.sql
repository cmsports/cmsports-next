-- Ajustes según lo que respondió el profe el 28 de julio de 2026.
--
--   · No hay clases los martes de 20:30 a 22:30 en Buin. Confirmado: las tres
--     asignaciones que la planilla tenía ahí estaban mal y ya se habían caído
--     solas al cargar los datos. No hay bloque que crear.
--
--   · Patricio Farías entrena lunes, miércoles y jueves. Tenía miércoles y
--     jueves, le falta el lunes.
--
--   · Cristóbal García entrena lunes, martes y jueves en la noche, y miércoles
--     por la mañana. Tenía lunes y jueves; le faltan el martes y el miércoles AM.
--
--   · Juan Carlos Kania ya no entrena. Se le cierran las inscripciones y queda
--     dado de baja. No se borra: si vuelve, se reactiva sin recargar nada.
--
-- Sobre el martes de Cristóbal García: el único bloque de la tarde-noche que
-- existe los martes es el de 18:30, que se llama "Menores Formativo
-- Intermedio". Es adulto, así que el nombre no le calza, pero es el único
-- horario posible con lo que dijo. Si en realidad va a otro, se corrige con un
-- click desde su ficha.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── Ayudante: inscribir a alguien en un bloque, sin duplicar ──────────────
-- Busca por palabras sueltas, no por la frase pegada: "patricio farias" tiene
-- que encontrar a "Patricio Ignacio Farías Pérez", con el Ignacio en el medio.
CREATE OR REPLACE FUNCTION pg_temp.buscar_jugador(p_nombre text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_n  integer;
BEGIN
  -- array_agg y no min: Postgres no tiene un min() para uuid.
  SELECT count(*), (array_agg(j.id))[1] INTO v_n, v_id
  FROM jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND (j.es_externo IS NULL OR j.es_externo = false)
    AND (
      SELECT bool_and(palabra = ANY(string_to_array(public._norm_nombre(j.nombre), ' ')))
      FROM unnest(string_to_array(public._norm_nombre(p_nombre), ' ')) AS palabra
    );

  -- Con la asistencia de por medio, ante la duda no se toca nada.
  IF v_n = 0 THEN RAISE EXCEPTION 'No se encontró a %', p_nombre; END IF;
  IF v_n > 1 THEN RAISE EXCEPTION 'El nombre % coincide con % jugadores', p_nombre, v_n; END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.inscribir(p_nombre text, p_dia text, p_hora time)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_jugador uuid;
  v_bloque  uuid;
BEGIN
  v_jugador := pg_temp.buscar_jugador(p_nombre);

  SELECT id INTO v_bloque FROM bloques_horario
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND sede = 'buin' AND dia_semana = p_dia AND hora_inicio = p_hora
    AND vigente_hasta IS NULL;
  IF v_bloque IS NULL THEN RAISE EXCEPTION 'No hay bloque en buin el % a las %', p_dia, p_hora; END IF;

  INSERT INTO bloque_jugadores (bloque_id, jugador_id, vigente_desde)
  VALUES (v_bloque, v_jugador, current_date)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── Patricio Farías: le faltaba el lunes ─────────────────────────────────
SELECT pg_temp.inscribir('patricio farias', 'lun', '20:30');

-- ── Cristóbal García: martes noche y miércoles por la mañana ─────────────
SELECT pg_temp.inscribir('cristobal garcia', 'mar', '18:30');
SELECT pg_temp.inscribir('cristobal garcia', 'mie', '09:00');

-- ── Juan Carlos Kania: ya no entrena ─────────────────────────────────────
UPDATE bloque_jugadores SET vigente_hasta = current_date
WHERE jugador_id = pg_temp.buscar_jugador('juan carlos kania')
  AND vigente_hasta IS NULL;

UPDATE jugadores SET estado = 'bloqueado'
WHERE id = pg_temp.buscar_jugador('juan carlos kania');

COMMIT;


-- ── Verificación: cómo quedaron los tres ─────────────────────────────────
SELECT j.nombre, j.estado,
       coalesce(b.sede, '—')                             AS sede,
       coalesce(b.dia_semana, '—')                       AS dia,
       coalesce(to_char(b.hora_inicio, 'HH24:MI'), '—')  AS hora,
       coalesce(b.nombre, 'sin grupo')                   AS grupo
FROM jugadores j
LEFT JOIN bloque_jugadores bj ON bj.jugador_id = j.id AND bj.vigente_hasta IS NULL
LEFT JOIN bloques_horario b   ON b.id = bj.bloque_id
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (
    j.nombre ILIKE '%patricio%far%as%'
    OR j.nombre ILIKE '%crist%bal%garc%a%arriagada%'
    OR j.nombre ILIKE '%kania%'
  )
ORDER BY j.nombre,
         array_position(ARRAY['lun','mar','mie','jue','vie'], b.dia_semana),
         b.hora_inicio;
