-- Fuera `ranking_general`: una tabla que nadie escribe, nadie lee y no está
-- en el repo.
--
-- ── Cómo apareció ─────────────────────────────────────────────────────────
-- La auditoría del 2026-08-09 (`node scripts/auditar-migraciones.mjs`) encontró
-- `134_ranking_general` registrada en `_migraciones_aplicadas` —corrió el
-- 2026-08-06 20:53— sin ningún archivo que le corresponda. No está en el repo
-- ni en ningún commit del historial: se pegó directo en el SQL Editor y su SQL
-- se perdió. Su único rastro es la tabla que dejó.
--
-- ── Por qué se borra y no se documenta ────────────────────────────────────
-- Porque no participa de nada. El ranking se calcula al vuelo desde
-- `torneo_partidos` (`src/lib/domain/rankingInterno.ts`, pantallas /ranking y
-- /torneos-internos); esta tabla no aparece en ninguna consulta del código,
-- solo en dos listas de respaldo que enumeran tablas a copiar.
--
-- La prueba de que nadie le escribe no es que esté vacía —eso solo diría que
-- todavía no se usó—: es que hay 4 torneos y 117 partidos cargados, 3 de ellos
-- ya jugados, y sigue en 0 filas. Si algo la alimentara, tendría datos.
--
-- Una tabla que nadie mantiene y nadie mira es superficie de ataque sin dueño.
-- Mismo criterio que la 133 con `club_photos`, la 136 con `presupuesto_vs_real`
-- y la 138 con la vista `division_ranking`.
--
-- ── El respaldo acá guarda la estructura, no los datos ────────────────────
-- La tabla está vacía, así que copiarla no salva ninguna fila. Salva otra cosa
-- que sí se perdió: la definición de columnas de la migración que no está en el
-- repo. Si mañana resulta que esto servía para algo, el respaldo es lo único
-- que dice cómo estaba hecha.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('140_borrar_ranking_general');


-- ══ 1. Se planta si alguien empezó a usarla ═══════════════════════════════
-- El día que esto se corra, la tabla tiene que seguir vacía. Si tiene filas es
-- que algo la llenó entre la auditoría y ahora, y entonces la premisa entera
-- de esta migración es falsa: aborta y no borra nada.
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.ranking_general;
  RAISE NOTICE 'Filas en ranking_general: %', v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ranking_general tiene % fila(s): alguien la está usando. No se borra.', v_n;
  END IF;
END $$;


-- ══ 2. Respaldo de la estructura ══════════════════════════════════════════
-- Nombre único y SIN `IF NOT EXISTS`: si esto se corriera dos veces, el CREATE
-- falla con "relation already exists" y aborta antes del DROP. El error es la
-- protección — es lo que le faltó a la 089.
CREATE TABLE _respaldo_ranking_general_20260809 AS
SELECT * FROM public.ranking_general;

COMMENT ON TABLE _respaldo_ranking_general_20260809 IS
  'Estructura de ranking_general, borrada por la 140. La migración que la creó (134_ranking_general) nunca estuvo en el repo: esta tabla vacía es el único registro de cómo estaba definida.';


-- ══ 3. Fuera ══════════════════════════════════════════════════════════════
DROP TABLE public.ranking_general;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Ya no está. Tiene que dar 0.
SELECT count(*) AS deberia_ser_cero
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'ranking_general';

-- 2) El respaldo con su estructura quedó guardado. Tiene que dar 1.
SELECT count(*) AS deberia_ser_uno
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_respaldo_ranking_general_20260809';

-- 3) Las columnas que tenía, por si alguna vez hacen falta.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '_respaldo_ranking_general_20260809'
ORDER BY ordinal_position;

-- 4) El ranking sigue teniendo de dónde salir: se calcula desde acá.
SELECT (SELECT count(*) FROM torneos)         AS torneos,
       (SELECT count(*) FROM torneo_partidos) AS partidos,
       (SELECT count(*) FROM torneo_partidos WHERE ganador IS NOT NULL) AS ya_jugados;
