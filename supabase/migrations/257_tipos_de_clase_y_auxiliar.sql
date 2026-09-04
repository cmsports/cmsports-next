-- ────────────────────────────────────────────────────────────
-- Tipos de clase, entrenador auxiliar, plantilla de la sesión y clase que se
-- cobra aparte.
--
-- Este cambio afecta a: **Spinhouse**. El ESQUEMA cambia para todos —tres
-- columnas en `bloques_horario` y una en `bloque_profesores`—, pero todas
-- nacen con el valor que reproduce el comportamiento de hoy y ninguna pantalla
-- las muestra sin el módulo 'tipos_clase', que solo se enciende acá para
-- Spinhouse. Para Buin esto no existe.
--
-- ══ Qué pide el club ══════════════════════════════════════════════════════
--
-- Del formulario, textual: "Clase grupal por nivel y categoría, entrenamiento
-- del grupo competitivo, clases particulares (1 o 2 alumnos), escuela de
-- adultos, tenis de mesa paralímpico y arriendo libre de mesas. Información
-- adicional por clase: mesas asignadas, entrenador principal y auxiliar,
-- objetivo o plantilla de la sesión, y si la clase se descuenta de la
-- mensualidad o se cobra aparte (particulares)."
--
-- Las mesas asignadas ya están (migraciones 249 y 251). Falta el resto.
--
-- ══ El tipo es UNA columna, no tres banderas ═════════════════════════════
--
-- La tentación es `es_particular`, `es_paralimpico`, `es_arriendo` y seguir
-- sumando booleanos. Con eso son representables los ocho estados imposibles
-- —particular y arriendo a la vez— y ninguna pantalla sabe cuál gana. Un tipo
-- cerrado con CHECK no tiene estados imposibles. El catálogo y el mapeo a la
-- modalidad con que se cuentan las mesas viven en `src/lib/domain/tiposClase.ts`.
--
-- ══ El auxiliar va en `bloque_profesores`, que YA existe ═════════════════
--
-- La 073 creó esa tabla justamente porque un bloque puede tener dos profes:
-- "en Fátima varios bloques los toman dos profes a la vez". Lo que faltaba no
-- era la relación, era distinguir cuál de los dos es el principal. Es una
-- columna en la tabla que ya está, no una tabla nueva ni una columna
-- `auxiliar_id` en el bloque —que además solo permitiría uno—.
--
-- El DEFAULT 'principal' es lo que deja a Buin igual: sus filas actuales pasan
-- a decir explícitamente lo que ya significaban.
--
-- ══ La plantilla de la sesión NO se construye: se enlaza ═════════════════
--
-- `tecnico_planes` ya existe desde la 168, con nombre, nivel, objetivo general,
-- duración y sus ejercicios ordenados. Es exactamente "el objetivo o plantilla
-- de la sesión" que el club pide. Construir un campo de texto al lado sería
-- tener dos lugares donde vive lo mismo y ninguno completo. Va un FK nullable.
--
-- `ON DELETE SET NULL` y no CASCADE: borrar un plan de entrenamiento no puede
-- borrar el bloque horario de los martes.
--
-- ══ Lo que este archivo deja AFUERA a propósito ══════════════════════════
--
-- `se_cobra_aparte` marca la clase que no se descuenta de la mensualidad, pero
-- **no cobra nada**. El monto de un particular es una decisión de precio y los
-- precios viven en `planes_club` (migración 252). Una columna de bandera que
-- además fijara el valor sería el `if` por club otra vez, con otro nombre.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
-- 256 está usada DOS veces —`256_pagos_clubes_monto_neto` y
-- `256_perfil_tecnico_solo_staff`, dos ramas que eligieron el mismo número y
-- las dos ya corridas—. El siguiente libre es 257.
SELECT _migracion_nueva('257_tipos_de_clase_y_auxiliar');
SELECT _migracion_para_club('Spinhouse');


-- ══ 1. Las tres columnas del bloque ══════════════════════════════════════
--
-- `tipo_clase` nullable: un bloque sin tipo se comporta como 'grupal', que es
-- lo que `mesas.ts` ya asumía. Los bloques de Buin quedan en NULL y su cupo no
-- se mueve un punto.
ALTER TABLE public.bloques_horario
  ADD COLUMN IF NOT EXISTS tipo_clase      text,
  ADD COLUMN IF NOT EXISTS plan_id         uuid,
  ADD COLUMN IF NOT EXISTS se_cobra_aparte boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bloques_tipo_clase_valido'
  ) THEN
    ALTER TABLE public.bloques_horario ADD CONSTRAINT bloques_tipo_clase_valido
      CHECK (tipo_clase IS NULL OR tipo_clase IN
        ('grupal', 'competitivo', 'particular', 'adultos', 'paralimpico', 'arriendo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bloques_plan_fk'
  ) THEN
    ALTER TABLE public.bloques_horario ADD CONSTRAINT bloques_plan_fk
      FOREIGN KEY (plan_id) REFERENCES public.tecnico_planes(id) ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.bloques_horario.tipo_clase IS
  'grupal | competitivo | particular | adultos | paralimpico | arriendo. NULL = grupal, que es como se comportaba antes de que esta columna existiera. Solo ''particular'' cambia la cuenta de mesas (cupos.por_mesa_particular).';
COMMENT ON COLUMN public.bloques_horario.plan_id IS
  'Plantilla de la sesión: FK a tecnico_planes (migración 168). NO duplicar el objetivo como texto acá.';
COMMENT ON COLUMN public.bloques_horario.se_cobra_aparte IS
  'true = la clase NO se descuenta de la mensualidad (particulares). Marca la clase; el monto sale de planes_club, no de acá.';


-- ══ 2. Principal y auxiliar ══════════════════════════════════════════════
--
-- DEFAULT 'principal': las filas que ya existen pasan a decir explícitamente
-- lo que ya significaban. Ningún bloque cambia de profesor.
ALTER TABLE public.bloque_profesores
  ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'principal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bloque_profesores_rol_valido'
  ) THEN
    ALTER TABLE public.bloque_profesores ADD CONSTRAINT bloque_profesores_rol_valido
      CHECK (rol IN ('principal', 'auxiliar'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.bloque_profesores.rol IS
  'principal | auxiliar. Default principal: es lo que significaban todas las filas anteriores a esta migración.';


-- ══ 3. El módulo, solo para Spinhouse ════════════════════════════════════
--
-- `array_append` sobre el array actual y no una lista escrita a mano: asignar
-- `modulos_habilitados = ARRAY[...]` acá borraría los módulos que el club ya
-- tiene, que es un error que se paga apagándole medio sistema al cliente.
DO $$
BEGIN
  UPDATE public.clubes
  SET    modulos_habilitados = array_append(modulos_habilitados, 'tipos_clase')
  WHERE  nombre = 'Spinhouse'
    AND  NOT ('tipos_clase' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
--
-- Las columnas nuevas y sus defaults:
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM   information_schema.columns
--   WHERE  table_name = 'bloques_horario'
--     AND  column_name IN ('tipo_clase', 'plan_id', 'se_cobra_aparte');
--
-- Que Buin NO se movió — todos sus bloques siguen sin tipo y sin cobro aparte:
--
--   SELECT count(*) FILTER (WHERE tipo_clase IS NOT NULL)  AS con_tipo,
--          count(*) FILTER (WHERE se_cobra_aparte)         AS cobran_aparte
--   FROM   bloques_horario
--   WHERE  club_id = (SELECT id FROM clubes WHERE nombre ILIKE 'Asociación TDM Buin%');
--   -- Las dos tienen que dar 0.
--
-- Que todas las filas de profesores quedaron como principal:
--
--   SELECT rol, count(*) FROM bloque_profesores GROUP BY rol;
--
-- Y el módulo:
--
--   SELECT nombre, 'tipos_clase' = ANY(modulos_habilitados) AS tipos_clase
--   FROM clubes ORDER BY nombre;
