-- Un torneo declara su modalidad. La que existe hoy pasa a llamarse 'grupos'.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Declara qué modalidades existen y agrega una columna que nace
-- con el valor de hoy. Ninguna fila cambia de contenido.
--
-- ══ 1. Por qué esta migración no migra datos ══════════════════════════════
--
-- `torneos.formato` YA EXISTE, y `crearTorneo` la escribe con 'grupos' fijo
-- desde siempre (src/app/actions/torneos.ts:147). Verificado en producción el
-- 2026-09-09: los 10 torneos de la base dicen 'grupos', y no hay ningún NULL.
--
-- Nadie la lee. Cero `select` la menciona.
--
-- O sea: la columna estaba escrita y esperando, con el dato correcto ya puesto
-- en todas las filas. Esto solo declara qué valores valen y le pone el default.
-- La 262 tuvo que agregar columnas y comprobar que el default quedara; acá no
-- hay nada que rellenar.
--
-- ══ 2. Las cuatro modalidades ═════════════════════════════════════════════
--
--   grupos                   fase de grupos + llave. Lo que existe hoy, y el
--                            default. Un torneo que no elija nada es este.
--   liguilla                 todos contra todos, una o dos ruedas, sin llave.
--   eliminacion_consolacion  llave directa + cuadro de consuelo para que nadie
--                            juegue un solo partido.
--   equipos                  Swaythling (5 individuales) o Corbillon
--                            (4 individuales + dobles).
--
-- Las tres últimas todavía no las genera nadie: esta migración es el andamiaje
-- de la Fase A. Se declaran ahora para que el CHECK no haya que tocarlo tres
-- veces más, y porque el catálogo del código las declara igual.
--
-- ══ 3. Lo que protege a Buin ══════════════════════════════════════════════
--
--   · El default es 'grupos', que es lo que ya dicen todas las filas.
--   · La columna pasa a NOT NULL: no existe "torneo sin modalidad", así que
--     ninguna pantalla tiene que decidir qué hacer con un NULL.
--   · El selector de modalidad solo aparece con el módulo encendido y SOLO en
--     Torneo Externo. El torneo interno se queda tradicional, y eso lo hace
--     cumplir `crearTorneo`, no el formulario.
--
-- `ruedas` solo la mira la liguilla. Nace en 1 y en cualquier otra modalidad
-- se ignora; existe como columna y no dentro de un jsonb porque es un número
-- con dos valores posibles, no una estructura.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-09

BEGIN;
SELECT _migracion_nueva('264_modalidades_de_torneo');
SELECT _migracion_para_todos_los_clubes(
  'declara qué modalidades de torneo existen y agrega una columna con el valor actual por defecto; no cambia el contenido de ninguna fila');

-- 1) Ningún torneo puede tener un formato fuera de la lista, ni quedar en NULL.
--    Si lo hay, esto aborta la transacción entera antes de tocar el esquema.
DO $$
DECLARE
  v_fuera text;
  v_nulos integer;
BEGIN
  SELECT string_agg(DISTINCT formato, ', ') INTO v_fuera
  FROM public.torneos
  WHERE formato IS NOT NULL
    AND formato NOT IN ('grupos', 'liguilla', 'eliminacion_consolacion', 'equipos');

  IF v_fuera IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay torneos con un formato fuera de la lista: %. Revisar antes de aplicar.', v_fuera;
  END IF;

  SELECT count(*) INTO v_nulos FROM public.torneos WHERE formato IS NULL;
  IF v_nulos > 0 THEN
    RAISE EXCEPTION
      'Hay % torneos con formato NULL. Ponerlos en grupos a mano y volver a correr.', v_nulos;
  END IF;
END $$;

-- 2) La modalidad: default, NOT NULL y lista cerrada.
ALTER TABLE public.torneos
  ALTER COLUMN formato SET DEFAULT 'grupos';
ALTER TABLE public.torneos
  ALTER COLUMN formato SET NOT NULL;

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_formato_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_formato_check
  CHECK (formato IN ('grupos', 'liguilla', 'eliminacion_consolacion', 'equipos'));

-- 3) Cuántas ruedas juega una liguilla. El resto de las modalidades la ignora.
ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS ruedas smallint NOT NULL DEFAULT 1;

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_ruedas_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_ruedas_check
  CHECK (ruedas IN (1, 2));

COMMENT ON COLUMN public.torneos.formato IS
  'Modalidad del torneo: grupos (tradicional, default), liguilla, eliminacion_consolacion, equipos. Solo se elige en torneos externos y con el módulo encendido; el interno es siempre grupos.';
COMMENT ON COLUMN public.torneos.ruedas IS
  'Cuántas veces se enfrentan todos en una liguilla (1 o 2). Las demás modalidades la ignoran.';

-- 4) Comprobación: el default quedó puesto, la columna no admite nulos, y un
--    torneo nuevo sin declarar modalidad sigue siendo el tradicional.
--
--    Se mira el DEFAULT y no los datos a propósito: "los 10 torneos dicen
--    grupos" es cierto hoy y deja de serlo apenas alguien cree una liguilla,
--    así que como comprobación mentiría más adelante.
DO $$
DECLARE
  v_default text;
  v_nullable text;
BEGIN
  SELECT column_default, is_nullable INTO v_default, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'torneos' AND column_name = 'formato';

  IF v_default IS NULL OR v_default NOT LIKE '%grupos%' THEN
    RAISE EXCEPTION 'El default de formato no quedó en grupos (es: %)', v_default;
  END IF;
  IF v_nullable <> 'NO' THEN
    RAISE EXCEPTION 'formato quedó aceptando NULL';
  END IF;

  RAISE NOTICE 'Comprobado: formato NOT NULL con default grupos.';
END $$;

COMMIT;
