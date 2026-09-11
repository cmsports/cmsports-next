-- Ventana horaria de la liga: desde qué hora hasta qué hora se juega.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Agrega dos columnas NOT NULL con el valor que el sistema
-- usó siempre, así que ninguna liga existente cambia su horario.
--
-- ══ Por qué esto hacía falta ═══════════════════════════════════════════════
--
-- `BLOQUE_INICIO = '09:00'` y `BLOQUE_FIN = '17:00'` (src/lib/domain/liga.ts)
-- eran constantes fijas para TODAS las ligas de TODOS los clubes. Spinhouse
-- entrena en otro horario —de noche, no de 9 a 17— y con esas constantes fijas
-- la única forma de atenderlo habría sido un `if(clubId)` en el motor
-- compartido, exactamente lo que CLAUDE.md prohíbe.
--
-- La buena noticia, verificada leyendo el código antes de escribir esto:
-- `generarBloquesHorario()`, `fechasRecomendadas()` y `programarDivision()`
-- YA reciben la ventana como parámetro — nunca estuvieron atados a la
-- constante por diseño. Lo único que faltaba era un lugar donde CADA liga
-- guardara su propia ventana, y que los ocho lugares que llamaban a esas
-- funciones leyeran de ahí en vez de la constante.
--
-- ══ Por qué el aviso de viabilidad no es nuevo, solo se corrigió ══════════
--
-- El formulario de creación YA calculaba y mostraba cuántas fechas hacen
-- falta (`fechasRecomendadas`) contra las que el admin eligió, con un aviso
-- verde o ámbar. Pero lo hacía con la ventana de 8 horas fija: si un club
-- jugaba solo 2 horas por fecha, el aviso decía que alcanzaba cuando en
-- realidad hacían falta muchas más fechas. Ahora ese mismo cálculo usa la
-- ventana que el admin acaba de elegir en el mismo formulario.
--
-- ══ Lo que protege a Buin ═══════════════════════════════════════════════
--
-- Las dos columnas nacen en '09:00' y '17:00' —la ventana de siempre—, así
-- que una liga existente, o una nueva donde nadie toque el selector de hora,
-- se comporta exactamente igual a antes de que estas columnas existieran.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('268_liga_ventana_horaria');
SELECT _migracion_para_todos_los_clubes(
  'agrega dos columnas con el horario actual (09:00-17:00) como default; no cambia ninguna fila existente');

ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS hora_inicio text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS hora_fin text NOT NULL DEFAULT '17:00';

-- Mismo formato HH:MM que usa `esHoraHHMM()` en el código, y hora_fin
-- estrictamente después de hora_inicio: una ventana de cero minutos no genera
-- ningún bloque y dejaría la liga sin poder programarse, sin decir por qué.
ALTER TABLE public.ligas
  DROP CONSTRAINT IF EXISTS ligas_hora_formato_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_hora_formato_check
  CHECK (hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND hora_fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE public.ligas
  DROP CONSTRAINT IF EXISTS ligas_hora_rango_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_hora_rango_check
  CHECK (hora_fin > hora_inicio);

COMMENT ON COLUMN public.ligas.hora_inicio IS
  'Desde qué hora se juega cada fecha, formato HH:MM. Lo elige el admin al crear la liga; default 09:00 = lo que el sistema hizo siempre.';
COMMENT ON COLUMN public.ligas.hora_fin IS
  'Hasta qué hora se juega cada fecha, formato HH:MM. Default 17:00 = lo que el sistema hizo siempre.';

-- Comprobación: todas las ligas existentes quedaron en la ventana de siempre.
DO $$
DECLARE
  v_distintas integer;
BEGIN
  SELECT count(*) INTO v_distintas
  FROM public.ligas
  WHERE hora_inicio <> '09:00' OR hora_fin <> '17:00';

  IF v_distintas <> 0 THEN
    RAISE EXCEPTION
      'Hay % ligas con un horario distinto al default recién puesto. Revisar antes de continuar.', v_distintas;
  END IF;

  RAISE NOTICE 'Comprobado: todas las ligas existentes quedaron en 09:00–17:00.';
END $$;

COMMIT;
