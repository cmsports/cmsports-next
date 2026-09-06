-- Cada torneo declara al mejor de cuántos sets se juega, y por fase.
--
-- Hasta hoy el módulo de Torneos —internos y externos— estaba clavado en Mejor
-- de Cinco: los únicos marcadores que aceptaba eran 3-0, 3-1, 3-2 y sus
-- inversos. Ahora se elige al crear el torneo, junto con el nombre y la fecha.
--
-- Dos columnas y no una porque así se juega de verdad: los grupos al mejor de 3
-- para que quepan en las mesas y en el horario, y la llave al mejor de 5 desde
-- que empieza a definirse.
--
-- El default es 'bo5' en las dos: un torneo que ya existe, o uno nuevo donde
-- nadie toque el selector, se comporta exactamente como antes de esta columna.
--
-- Lo que el formato NO toca, y conviene tener claro:
--   · La tabla de posiciones de los grupos. Son 2 puntos por victoria y los
--     desempates son RATIOS (sets y puntos a favor/en contra), así que un 2-0
--     al mejor de 3 y un 3-0 al mejor de 5 valen lo mismo: no cedió un set.
--   · El armado de la llave, las cabezas de serie, los BYE y el 3er lugar.
--   · El ranking, que paga por puesto final y no por sets.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('262_formato_partido_por_torneo');
SELECT _migracion_para_todos_los_clubes('agrega dos columnas con el comportamiento actual por defecto; no cambia ninguna fila');

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS formato_grupos text NOT NULL DEFAULT 'bo5',
  ADD COLUMN IF NOT EXISTS formato_llave text NOT NULL DEFAULT 'bo5';

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_formato_grupos_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_formato_grupos_check
  CHECK (formato_grupos IN ('bo3', 'bo5'));

ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_formato_llave_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_formato_llave_check
  CHECK (formato_llave IN ('bo3', 'bo5'));

-- Comprobación: las dos columnas quedaron con 'bo5' por defecto y sin nulos.
-- Eso es lo que garantiza que un torneo que ya existía, y uno nuevo donde nadie
-- toque el selector, se jueguen al mejor de 5 como hasta ahora.
--
-- Se mira el DEFAULT y no los datos a propósito: "todos los torneos están en
-- bo5" es cierto solo en este instante y deja de serlo apenas alguien elige
-- Mejor de 3, así que como comprobación mentiría más adelante.
DO $$
DECLARE
  v_ok integer;
BEGIN
  SELECT count(*) INTO v_ok
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'torneos'
    AND column_name IN ('formato_grupos', 'formato_llave')
    AND is_nullable = 'NO'
    AND column_default LIKE '%bo5%';
  IF v_ok <> 2 THEN
    RAISE EXCEPTION 'Las columnas de formato no quedaron NOT NULL con default bo5 (encontradas: %)', v_ok;
  END IF;
END $$;

COMMIT;
