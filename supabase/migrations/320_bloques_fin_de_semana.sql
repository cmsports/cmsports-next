-- Bloques de fin de semana: el espejo de la ficha y la clase extra aprenden
-- el sábado y el domingo.
--
-- Todo va en una sola transacción: si algo falla, no queda nada a medias. Ojo
-- que reescribe funciones de la 111 desde el texto del repo, que va atrás de la
-- base (ver docs/plan-bloques-fin-de-semana.md, Fase 0).
--
-- Qué cambia:
--   1. `jugadores` y `jugador_horario_historial` ganan `entrena_sab` y
--      `entrena_dom` (false por defecto: nadie tiene bloques de fin de semana
--      todavía, así que ninguna fila cambia de valor).
--   2. `dias_canonicos_jugador`, `aplicar_dias_jugador` y el trigger que
--      protege el espejo calculan también sábado y domingo.
--   3. `registrar_clase_extraordinaria` deja de rechazar el fin de semana.
--      Las funciones de cupos y recuperaciones (226, 231) ya traducían los
--      siete días y no se tocan.
--
-- Qué NO cambia: `bloques_horario.dia_semana` ya aceptaba 'sab' y 'dom' desde
-- la 073. Ninguna fila se escribe, por eso va para todos los clubes.
--
-- ORDEN DE DESPLIEGUE: esta migración se pega ANTES de subir el código. El
-- código nuevo pide `entrena_sab` y `entrena_dom` en varios select y falla
-- mientras las columnas no existan.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('320_bloques_fin_de_semana');
SELECT _migracion_para_todos_los_clubes('cambia el esquema y funciones, no escribe ninguna fila');

-- ── 1. Las columnas ───────────────────────────────────────────────────────
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS entrena_sab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrena_dom boolean NOT NULL DEFAULT false;

ALTER TABLE public.jugador_horario_historial
  ADD COLUMN IF NOT EXISTS entrena_sab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrena_dom boolean NOT NULL DEFAULT false;

-- ── 2. El cálculo canónico, con los siete días ────────────────────────────
-- Cambia el tipo de retorno (columnas nuevas), así que no alcanza con
-- CREATE OR REPLACE: hay que soltarla primero. Las funciones que la llaman son
-- plpgsql y la resuelven en ejecución, no hay dependencia dura.
DROP FUNCTION IF EXISTS public.dias_canonicos_jugador(uuid);

CREATE FUNCTION public.dias_canonicos_jugador(p_jugador uuid)
RETURNS TABLE (
  o_lun boolean, o_mar boolean, o_mie boolean, o_jue boolean, o_vie boolean,
  o_sab boolean, o_dom boolean,
  o_sede text, o_horario text, o_tiene_bloques boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH b AS (
    SELECT bh.dia_semana, bh.sede,
           to_char(bh.hora_inicio, 'HH24:MI') || '-' || to_char(bh.hora_fin, 'HH24:MI') AS rango
    FROM bloque_jugadores bj
    JOIN bloques_horario bh ON bh.id = bj.bloque_id
    WHERE bj.jugador_id = p_jugador
      AND bj.vigente_hasta IS NULL
      AND (bh.vigente_hasta IS NULL
           OR bh.vigente_hasta >= (now() AT TIME ZONE 'America/Santiago')::date)
  )
  SELECT
    COALESCE(bool_or(dia_semana = 'lun'), false),
    COALESCE(bool_or(dia_semana = 'mar'), false),
    COALESCE(bool_or(dia_semana = 'mie'), false),
    COALESCE(bool_or(dia_semana = 'jue'), false),
    COALESCE(bool_or(dia_semana = 'vie'), false),
    COALESCE(bool_or(dia_semana = 'sab'), false),
    COALESCE(bool_or(dia_semana = 'dom'), false),
    CASE WHEN bool_or(sede = 'buin') AND bool_or(sede = 'paine') THEN 'ambos'
         WHEN bool_or(sede = 'buin')  THEN 'buin'
         WHEN bool_or(sede = 'paine') THEN 'paine' END,
    (SELECT rango FROM b GROUP BY rango ORDER BY count(*) DESC, rango LIMIT 1),
    count(*) > 0
  FROM b;
$$;

-- El DROP borró también los permisos: la 134 le había quitado EXECUTE a
-- PUBLIC, anon y authenticated (es un ayudante de los triggers, SECURITY
-- DEFINER y sin chequeo de club). Recrearla sin esto la dejaría llamable por RPC
-- con el uuid de un jugador de cualquier club.
REVOKE ALL ON FUNCTION public.dias_canonicos_jugador(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_dias_jugador(p_jugador uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM dias_canonicos_jugador(p_jugador);
  UPDATE jugadores SET
    entrena_lun = c.o_lun, entrena_mar = c.o_mar, entrena_mie = c.o_mie,
    entrena_jue = c.o_jue, entrena_vie = c.o_vie,
    entrena_sab = c.o_sab, entrena_dom = c.o_dom,
    horario = c.o_horario,
    sede = CASE WHEN c.o_tiene_bloques THEN c.o_sede ELSE sede END
  WHERE id = p_jugador;
END;
$$;

CREATE OR REPLACE FUNCTION public.jugadores_dias_solo_desde_bloques()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM dias_canonicos_jugador(NEW.id);
  NEW.entrena_lun := c.o_lun;
  NEW.entrena_mar := c.o_mar;
  NEW.entrena_mie := c.o_mie;
  NEW.entrena_jue := c.o_jue;
  NEW.entrena_vie := c.o_vie;
  NEW.entrena_sab := c.o_sab;
  NEW.entrena_dom := c.o_dom;
  NEW.horario     := c.o_horario;
  IF c.o_tiene_bloques THEN
    NEW.sede := c.o_sede;
  ELSE
    NEW.sede := OLD.sede;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jugadores_dias_solo_desde_bloques ON jugadores;
CREATE TRIGGER jugadores_dias_solo_desde_bloques
  BEFORE UPDATE OF entrena_lun, entrena_mar, entrena_mie, entrena_jue,
                   entrena_vie, entrena_sab, entrena_dom, sede, horario ON jugadores
  FOR EACH ROW
  WHEN (OLD.entrena_lun IS DISTINCT FROM NEW.entrena_lun
     OR OLD.entrena_mar IS DISTINCT FROM NEW.entrena_mar
     OR OLD.entrena_mie IS DISTINCT FROM NEW.entrena_mie
     OR OLD.entrena_jue IS DISTINCT FROM NEW.entrena_jue
     OR OLD.entrena_vie IS DISTINCT FROM NEW.entrena_vie
     OR OLD.entrena_sab IS DISTINCT FROM NEW.entrena_sab
     OR OLD.entrena_dom IS DISTINCT FROM NEW.entrena_dom
     OR OLD.sede        IS DISTINCT FROM NEW.sede
     OR OLD.horario     IS DISTINCT FROM NEW.horario)
  EXECUTE FUNCTION public.jugadores_dias_solo_desde_bloques();

-- ── 3. Clase extra en fin de semana ───────────────────────────────────────
-- En vez de pegar de nuevo el cuerpo entero de la función (el repo puede ir
-- atrás de la base), se toma el texto VIVO y se le cambia solo la línea que
-- vuelve NULL el sábado y el domingo. Si esa línea no se encuentra tal cual, la
-- migración se cae entera: es preferible a dejar la función a medias.
DO $$
DECLARE
  f record;
  v_def text;
  v_nuevo text;
  v_cambiadas int := 0;
BEGIN
  FOR f IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registrar_clase_extraordinaria'
  LOOP
    v_def := pg_get_functiondef(f.oid);
    v_nuevo := replace(
      v_def,
      '(ARRAY[NULL,''lun'',''mar'',''mie'',''jue'',''vie'',NULL])',
      '(ARRAY[''dom'',''lun'',''mar'',''mie'',''jue'',''vie'',''sab''])'
    );
    IF v_nuevo = v_def THEN
      -- Hay dos archivos "100" en el repo y la versión viva puede ser la que ya
      -- no valida el día (100_clases_extra_monto_cero). Si no menciona el
      -- rechazo del fin de semana, no hay nada que parchar. Si lo menciona pero
      -- la línea cambió de forma, se aborta: hay que mirarla a mano.
      IF v_def ILIKE '%no abre los fines de semana%' THEN
        RAISE EXCEPTION 'registrar_clase_extraordinaria (oid %) rechaza el fin de semana con un texto distinto al esperado: revisar a mano', f.oid;
      END IF;
      RAISE NOTICE 'registrar_clase_extraordinaria (oid %) no rechaza el fin de semana: sin cambios', f.oid;
    ELSE
      EXECUTE v_nuevo;
    END IF;
    v_cambiadas := v_cambiadas + 1;
  END LOOP;

  IF v_cambiadas = 0 THEN
    RAISE EXCEPTION 'No existe registrar_clase_extraordinaria';
  END IF;
END $$;

COMMIT;


-- ── Verificación 1: no debe devolver ninguna fila ─────────────────────────
-- Nadie tiene todavía un bloque de fin de semana, así que nadie debe figurar
-- entrenando sábado o domingo.
SELECT id, nombre, entrena_sab, entrena_dom
FROM jugadores
WHERE entrena_sab OR entrena_dom;

-- ── Verificación 2: las dos columnas existen y el trigger las vigila ──────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('jugadores', 'jugador_horario_historial')
  AND column_name IN ('entrena_sab', 'entrena_dom')
ORDER BY table_name, column_name;   -- esperado: 4 filas

-- ── Verificación 3: la función interna sigue cerrada ──────────────────────
-- Las tres columnas deben dar false (la 134 la dejó así y el DROP lo deshizo).
SELECT has_function_privilege('anon',          'public.dias_canonicos_jugador(uuid)', 'EXECUTE') AS anon,
       has_function_privilege('authenticated', 'public.dias_canonicos_jugador(uuid)', 'EXECUTE') AS authenticated,
       has_function_privilege('public',        'public.dias_canonicos_jugador(uuid)', 'EXECUTE') AS public_;

SELECT pg_get_functiondef('public.registrar_clase_extraordinaria'::regproc) ~ 'ARRAY\[''dom''' AS acepta_fin_de_semana;
