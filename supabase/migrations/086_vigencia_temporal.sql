-- Paso 2: inscripciones, bloques y profesores dejan de ser una foto del presente.
--
-- Hasta acá, sacar a alguien de un grupo borraba la fila. Eso hace imposible
-- responder "quién estaba en marzo", que es lo que el calendario histórico
-- necesita saber para dibujar los días que a cada uno le tocaban entonces.
--
-- La convención queda igual en las tres tablas:
--   vigente_desde  fecha en que empieza a valer (inclusive)
--   vigente_hasta  último día en que vale, o NULL si sigue abierto
--
-- Todo lo que existe hoy arranca con vigente_desde = la fecha en que se corre
-- esto. Hacia atrás el calendario queda vacío, que es lo correcto: el historial
-- de asistencia todavía no arrancó y no hay nada que inventar.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. Los bloques ════════════════════════════════════════════════════════
ALTER TABLE bloques_horario
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date;

UPDATE bloques_horario
SET vigente_desde = COALESCE(vigente_desde, current_date),
    vigente_hasta = CASE WHEN activo THEN NULL
                         ELSE COALESCE(vigente_hasta, current_date) END;

ALTER TABLE bloques_horario ALTER COLUMN vigente_desde SET NOT NULL;
ALTER TABLE bloques_horario ALTER COLUMN vigente_desde SET DEFAULT current_date;

-- `activo` queda como reflejo mientras se migran las pantallas que lo leen. Un
-- disparador lo mantiene al día para que nada viejo se rompa entre que se corre
-- la migración y llega el deploy. Se elimina al cerrar el proyecto.
CREATE OR REPLACE FUNCTION public.sincronizar_activo_bloque()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.activo := (NEW.vigente_hasta IS NULL OR NEW.vigente_hasta >= current_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloque_activo_desde_vigencia ON bloques_horario;
CREATE TRIGGER bloque_activo_desde_vigencia
  BEFORE INSERT OR UPDATE OF vigente_desde, vigente_hasta ON bloques_horario
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_activo_bloque();


-- ══ 2. Las inscripciones ══════════════════════════════════════════════════
-- La clave era (bloque, jugador), así que nadie podía estar dos veces. Con
-- historia eso es lo normal: entra, sale, vuelve. Pasa a id propio, y un
-- índice parcial garantiza una sola inscripción abierta por bloque y jugador.
ALTER TABLE bloque_jugadores
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date;

UPDATE bloque_jugadores
SET id = COALESCE(id, gen_random_uuid()),
    vigente_desde = COALESCE(vigente_desde, current_date);

ALTER TABLE bloque_jugadores DROP CONSTRAINT IF EXISTS bloque_jugadores_pkey;
ALTER TABLE bloque_jugadores ALTER COLUMN id SET NOT NULL;
ALTER TABLE bloque_jugadores ADD PRIMARY KEY (id);
ALTER TABLE bloque_jugadores ALTER COLUMN vigente_desde SET NOT NULL;
ALTER TABLE bloque_jugadores ALTER COLUMN vigente_desde SET DEFAULT current_date;

CREATE UNIQUE INDEX IF NOT EXISTS bloque_jug_una_abierta
  ON bloque_jugadores (bloque_id, jugador_id) WHERE vigente_hasta IS NULL;

CREATE INDEX IF NOT EXISTS bloque_jug_vigencia_idx
  ON bloque_jugadores (jugador_id, vigente_desde, vigente_hasta);


-- ══ 3. Los profesores del bloque ══════════════════════════════════════════
ALTER TABLE bloque_profesores
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date;

UPDATE bloque_profesores
SET id = COALESCE(id, gen_random_uuid()),
    vigente_desde = COALESCE(vigente_desde, current_date);

ALTER TABLE bloque_profesores DROP CONSTRAINT IF EXISTS bloque_profesores_pkey;
ALTER TABLE bloque_profesores ALTER COLUMN id SET NOT NULL;
ALTER TABLE bloque_profesores ADD PRIMARY KEY (id);
ALTER TABLE bloque_profesores ALTER COLUMN vigente_desde SET NOT NULL;
ALTER TABLE bloque_profesores ALTER COLUMN vigente_desde SET DEFAULT current_date;

CREATE UNIQUE INDEX IF NOT EXISTS bloque_prof_una_abierta
  ON bloque_profesores (bloque_id, profesor_id) WHERE vigente_hasta IS NULL;


-- ══ 4. Preguntar "quién estaba en tal fecha" sin repetir el WHERE ═════════
CREATE OR REPLACE FUNCTION public.inscritos_en_fecha(p_bloque uuid, p_fecha date)
RETURNS TABLE (jugador_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT bj.jugador_id
  FROM bloque_jugadores bj
  WHERE bj.bloque_id = p_bloque
    AND bj.vigente_desde <= p_fecha
    AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= p_fecha);
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM bloques_horario   WHERE vigente_hasta IS NULL) AS bloques_vigentes,
  (SELECT count(*) FROM bloque_jugadores  WHERE vigente_hasta IS NULL) AS inscripciones_abiertas,
  (SELECT count(*) FROM bloque_profesores WHERE vigente_hasta IS NULL) AS asignaciones_profe,
  (SELECT min(vigente_desde) FROM bloque_jugadores)                    AS historial_arranca;
