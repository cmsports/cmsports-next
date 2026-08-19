-- `traspasar_jugador` cierra la vigencia del bloque viejo con `current_date`,
-- y eso rompe dos reglas del proyecto al mismo tiempo.
--
-- ── Regla 1: la fecha tiene que ser la de Chile ───────────────────────────
-- `current_date` devuelve el día UTC. Después de las 21:00 en Chile ya es el
-- día siguiente allá, así que un traspaso hecho de noche se cierra con fecha
-- de mañana. Es la regla que el CLAUDE.md repite: usar
-- `(now() AT TIME ZONE 'America/Santiago')::date`.
--
-- ── Regla 2: se cierra con AYER, nunca con hoy ────────────────────────────
-- Y esta es la grave. `vigente_hasta` es el ÚLTIMO DÍA EN QUE VALE, así que
-- cerrar con hoy deja al jugador vivo hasta la medianoche. El comentario de
-- src/lib/domain/vigencia.ts lo explica y describe este caso exacto:
--
--   "al que cambiaban de bloque le aparecían los dos a la vez —el viejo
--    cerrado hoy y el nuevo abierto hoy se pisan un día— ... la misma persona
--    sí y no en dos pantallas"
--
-- El TypeScript ya lo hace bien con `cierreVigencia()`, que resta un día. Esta
-- función de la base se quedó atrás y sigue cerrando con hoy.
--
-- ── El caso que lo destapó ────────────────────────────────────────────────
-- El diagnóstico de salud encontró a Edison Muñoz Hernández inscrito en dos
-- bloques el mismo viernes: "Grupo AM" 09:00 en Buin (desde 2026-07-27) y
-- "Adulto - Master" 20:30 en Paine (desde 2026-07-31). Aparece en dos listas
-- de asistencia el mismo día, y como un día vencido sin lista cuenta como
-- falta, puede acumular ausencias de una clase a la que nunca tuvo que ir.
--
-- Esta migración NO arregla el caso de Edison: sus dos bloques están abiertos
-- (`vigente_hasta` nulo), así que no fue este cierre el que falló con él, y
-- decidir cuál de los dos sobra es una decisión del club, no de una migración.
-- Lo que se arregla acá es que no se vuelva a generar por esta vía.
--
-- ── Sobre el borde de dar de alta y de baja el mismo día ──────────────────
-- Si alguien entra a un bloque hoy y lo traspasan hoy mismo, cerrar con ayer
-- deja `vigente_hasta` anterior a `vigente_desde`. No es corrupción —el tramo
-- simplemente no valió ningún día— pero se evita igual con GREATEST, para que
-- las filas no queden con las fechas invertidas y confundan a quien las mire.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('202_traspasar_jugador_cierre_correcto');

DO $$
DECLARE
  v_def text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'traspasar_jugador'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe public.traspasar_jugador en esta base.';
  END IF;

  IF position('current_date' in v_def) = 0 THEN
    RAISE NOTICE 'Ya no usa current_date: no hay nada que cambiar.';
    RETURN;
  END IF;

  -- Se reemplaza el cierre por "ayer en hora de Chile", nunca anterior al día
  -- en que empezó a valer la fila.
  v_nuevo := replace(
    v_def,
    'SET vigente_hasta = current_date',
    'SET vigente_hasta = GREATEST(' ||
      '(now() AT TIME ZONE ''America/Santiago'')::date - 1, bj.vigente_desde)'
  );

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro el patron exacto a reemplazar. Revisar a mano.';
  END IF;

  EXECUTE v_nuevo;
  RAISE NOTICE 'traspasar_jugador actualizada: cierra con ayer, en hora de Chile.';
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Ya no debe quedar current_date en la función: cero filas.
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'traspasar_jugador'
  AND pg_get_functiondef(p.oid) ~ 'current_date';

-- 2) Y el cierre nuevo tiene que estar presente.
SELECT position('America/Santiago' in pg_get_functiondef(p.oid)) > 0 AS usa_hora_chile
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'traspasar_jugador';

-- 3) Nadie debería quedar con las fechas invertidas.
SELECT count(*) AS filas_con_fechas_invertidas
FROM bloque_jugadores
WHERE vigente_hasta IS NOT NULL AND vigente_hasta < vigente_desde;
