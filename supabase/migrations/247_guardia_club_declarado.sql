-- ────────────────────────────────────────────────────────────
-- El portazo real: la base rechaza el club equivocado.
--
-- Este cambio afecta a: TODOS los clubes. Es infraestructura. No toca ni una
-- fila: crea una función de trigger y la engancha a cuatro tablas.
--
-- ══ Qué hace ══════════════════════════════════════════════════════════════
--
--   Si hay un club declarado en la sesión Y la fila que se escribe es de otro
--   club → EXCEPCIÓN, y la transacción entera se cae.
--
-- Nada más. Y —esto es lo importante— **si no hay club declarado, no hace
-- absolutamente nada**. Fuera de una migración la variable no existe, así que
-- el trigger sale en su primera línea y la app no se entera de que existe.
--
-- ══ Por qué hace falta ════════════════════════════════════════════════════
--
-- La migración 246 le pide a cada migración que declare su club. Pero una
-- regla que depende de que alguien la respete no es una garantía: es una buena
-- intención. Esta capa no depende de nadie.
--
-- Es la misma escalera que ya funcionó una vez: `_migracion_nueva` convirtió
-- "acordate de no pegar dos veces" en una excepción de Postgres. Esto convierte
-- "acordate de no equivocarte de club" en otra.
--
-- ══ Las cuatro tablas ═════════════════════════════════════════════════════
--
--   movimientos    la plata
--   jugadores      las personas
--   asistencia     el registro diario
--   mensualidades  las cuotas
--
-- Son donde duele. Hay 28 tablas con `club_id`; cubrirlas todas es más seguro
-- y más caro, y `docs/plan-aislamiento-clubes.md` §8.1 dejó decidido empezar
-- por estas cuatro y ampliar si aparece un caso. Agregar una tabla después es
-- una línea en el arreglo de abajo.
--
-- Ver `docs/plan-aislamiento-clubes.md` §3, capa 3.
--
-- ⚠ DEPENDE DE LA 246. Usa `_migracion_para_todos_los_clubes`, que se crea
-- allá. Pegar la 246 primero o esta aborta en su tercera línea.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-02. Verificado: el portazo abortó una escritura de Buin
-- sobre una fila de otro club, y sin club declarado la escritura normal de
-- Buin pasó sin que el trigger se enterara.
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('247_guardia_club_declarado');
SELECT _migracion_para_todos_los_clubes(
  'crea el trigger de guardia sobre tablas de todos los clubes; no escribe ninguna fila');


-- ══ 1. La guardia ═════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._guardia_club_declarado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_declarado uuid;
  v_fila      uuid;
  v_nom_decl  text;
  v_nom_fila  text;
BEGIN
  -- ── La salida rápida ──────────────────────────────────────────────────
  -- Esto corre en cada INSERT de asistencia, cada pago, cada alta de jugador.
  -- Va primero y es una sola lectura de una variable de sesión: fuera de una
  -- migración, el trigger termina acá.
  --
  -- `current_setting(..., true)` devuelve NULL si la variable no está puesta,
  -- en vez de reventar. El `nullif` cubre el otro caso: la variante
  -- `_migracion_para_todos_los_clubes` la deja en texto vacío a propósito.
  v_declarado := nullif(current_setting('cmsports.club_declarado', true), '')::uuid;

  IF v_declarado IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- ── Hay club declarado: se revisan las dos puntas ──────────────────────
  -- En un UPDATE se miran OLD y NEW, no solo NEW. Si solo se mirara NEW, una
  -- migración que declara Buin podría MOVER una fila de otro club hacia Buin
  -- —o sacar una de Buin— sin que nada se queje. Las dos direcciones son el
  -- mismo error.
  --
  -- `club_id IS NULL` pasa. Una fila sin club no es "la fila de otro club",
  -- que es lo único que este trigger existe para atajar. Que a una fila le
  -- falte el club es un bug distinto y no es este el lugar de cazarlo.
  IF TG_OP <> 'INSERT' THEN
    v_fila := OLD.club_id;
    IF v_fila IS NOT NULL AND v_fila <> v_declarado THEN
      SELECT nombre INTO v_nom_decl FROM clubes WHERE id = v_declarado;
      SELECT nombre INTO v_nom_fila FROM clubes WHERE id = v_fila;
      RAISE EXCEPTION
        'Club equivocado. Esta migración declaró "%" (%), pero el % sobre la tabla "%" toca una fila de "%" (%). No se ejecutó nada: la transacción se abortó entera.',
        coalesce(v_nom_decl, '?'), v_declarado, TG_OP, TG_TABLE_NAME,
        coalesce(v_nom_fila, '?'), v_fila;
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_fila := NEW.club_id;
    IF v_fila IS NOT NULL AND v_fila <> v_declarado THEN
      SELECT nombre INTO v_nom_decl FROM clubes WHERE id = v_declarado;
      SELECT nombre INTO v_nom_fila FROM clubes WHERE id = v_fila;
      RAISE EXCEPTION
        'Club equivocado. Esta migración declaró "%" (%), pero el % sobre la tabla "%" escribe una fila de "%" (%). No se ejecutó nada: la transacción se abortó entera.',
        coalesce(v_nom_decl, '?'), v_declarado, TG_OP, TG_TABLE_NAME,
        coalesce(v_nom_fila, '?'), v_fila;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._guardia_club_declarado() IS
  'Rechaza escrituras de un club distinto al declarado por _migracion_para_club(). Inerte cuando no hay club declarado, que es siempre fuera de una migración.';


-- ══ 2. Enganchada a las cuatro tablas ═════════════════════════════════════
-- El arreglo está en un solo lugar para que las cuatro definiciones sean
-- idénticas por construcción y no por revisión. Agregar una tabla es agregar
-- su nombre acá.
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['movimientos', 'jugadores', 'asistencia', 'mensualidades'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guardia_club_declarado ON public.%I', v_tabla);
    EXECUTE format(
      'CREATE TRIGGER guardia_club_declarado
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public._guardia_club_declarado()',
      v_tabla);
  END LOOP;
END;
$$;

COMMIT;


-- ══ Si esto rompe algo en producción ══════════════════════════════════════
--
-- No debería: el trigger sale en su primera línea cuando no hay club
-- declarado, y fuera de una migración nunca lo hay. Pero toca las cuatro
-- tablas más calientes del sistema, así que la salida tiene que estar escrita
-- ANTES de necesitarla, no buscada a las apuradas.
--
-- Apagarlo entero, sin borrar nada:
--
--   ALTER TABLE movimientos   DISABLE TRIGGER guardia_club_declarado;
--   ALTER TABLE jugadores     DISABLE TRIGGER guardia_club_declarado;
--   ALTER TABLE asistencia    DISABLE TRIGGER guardia_club_declarado;
--   ALTER TABLE mensualidades DISABLE TRIGGER guardia_club_declarado;
--
-- Volver a encenderlo: lo mismo con ENABLE.


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Los cuatro triggers quedaron creados. Tienen que salir cuatro filas.
-- SELECT event_object_table, trigger_name, action_timing,
--        string_agg(event_manipulation, ', ' ORDER BY event_manipulation) AS eventos
-- FROM information_schema.triggers
-- WHERE trigger_name = 'guardia_club_declarado'
-- GROUP BY event_object_table, trigger_name, action_timing
-- ORDER BY event_object_table;

-- 2) LA PRUEBA QUE IMPORTA — que la app siga andando igual.
--    Sin club declarado, una escritura normal pasa. Se revierte sola.
--
-- BEGIN;
--   UPDATE jugadores SET nombre = nombre
--   WHERE id = (
--     SELECT id FROM jugadores
--     WHERE club_id = (SELECT id FROM clubes WHERE nombre = 'Asociación TDM Buin y Paine')
--     LIMIT 1);
--   -- Tiene que decir UPDATE 1, sin error.
-- ROLLBACK;

-- 3) LA OTRA PRUEBA QUE IMPORTA — que el portazo cierre.
--    Declara un club e intenta tocar una fila de otro: DEBE fallar con
--    "Club equivocado". El ROLLBACK va igual, falle o no.
--
-- BEGIN;
--   SELECT _migracion_para_club('Asociación TDM Buin y Paine');
--   UPDATE jugadores SET nombre = nombre
--   WHERE club_id <> (SELECT id FROM clubes WHERE nombre = 'Asociación TDM Buin y Paine');
-- ROLLBACK;

-- 4) Y que declarar el club correcto no estorbe.
--
-- BEGIN;
--   SELECT _migracion_para_club('Asociación TDM Buin y Paine');
--   UPDATE jugadores SET nombre = nombre
--   WHERE club_id = (SELECT id FROM clubes WHERE nombre = 'Asociación TDM Buin y Paine');
--   -- Tiene que pasar sin error.
-- ROLLBACK;
