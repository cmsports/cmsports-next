-- ────────────────────────────────────────────────────────────
-- La vista `division_ranking` cuenta victorias que no cuenta como partidos.
--
-- ── El defecto ────────────────────────────────────────────────────────────
-- Tal como la dejó la migración 017, `pj` exige que el partido esté cerrado y
-- `pg` no:
--
--     COUNT(lp.id) FILTER (WHERE deleted_at IS NULL
--                            AND estado IN ('finalizado','walkover')) AS pj,
--     COUNT(lp.id) FILTER (WHERE deleted_at IS NULL
--                            AND ganador_id = j.id)                   AS pg,
--
-- Los puntos arrastran el mismo criterio flojo: la victoria vale 3 sin mirar
-- el estado, mientras la derrota exige `estado = 'finalizado'`.
--
-- Un partido con `ganador_id` puesto y estado todavía intermedio —lo que
-- ocurre mientras el marcador está abierto, o si un walkover se escribe en dos
-- pasos— suma una victoria y 3 puntos sin sumar un partido jugado. La tabla
-- queda con más ganados que jugados, que es la clase de número que nadie
-- revisa porque "se ve plausible".
--
-- ── Alcance real, para no exagerarlo ──────────────────────────────────────
-- Ninguna pantalla lee esta vista: `grep -rn "division_ranking" src/` no
-- devuelve nada. La tabla de posiciones que se ve en la aplicación la calcula
-- `calcularRankingDivision` en src/lib/domain/liga.ts, que además desempata
-- por enfrentamiento directo con un mini-ranking —algo que la vista nunca
-- supo hacer—.
--
-- Entonces: hoy esto no muestra un número malo en ninguna parte. Se arregla
-- porque la vista sigue existiendo, es el lugar natural donde alguien va a
-- correr una consulta manual, y una vista con la aritmética mal es una trampa
-- puesta para el futuro.
--
-- Alternativa considerada y descartada: soltarla, como hizo la 136 con
-- `presupuesto_vs_real`. Se prefiere dejarla correcta porque a diferencia de
-- aquella, esta sí sirve para consultar a mano y ya tiene su `security_invoker`
-- bien puesto desde la 137. Si el club prefiere no tenerla, el DROP es una
-- línea y va en su propia migración.
--
-- No borra ni modifica ninguna fila.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('237_division_ranking_solo_jugados');

CREATE OR REPLACE VIEW public.division_ranking AS
SELECT
  ldj.division_id,
  j.id     AS jugador_id,
  j.nombre AS nombre,

  -- Partidos jugados: finalizado o walkover.
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.estado IN ('finalizado', 'walkover')
  ) AS pj,

  -- Ganados: mismo criterio de cierre que pj. Antes le faltaba el filtro de
  -- estado y por eso podía haber más ganados que jugados.
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.estado IN ('finalizado', 'walkover')
      AND lp.ganador_id = j.id
  ) AS pg,

  -- Perdidos: idem.
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.estado IN ('finalizado', 'walkover')
      AND lp.ganador_id IS NOT NULL
      AND lp.ganador_id <> j.id
  ) AS pp,

  -- Puntos: victoria 3, derrota en partido jugado 1, derrota por walkover 0.
  -- Es el mismo criterio que calcularRankingDivision en liga.ts.
  COALESCE(
    COUNT(lp.id) FILTER (
      WHERE lp.deleted_at IS NULL
        AND lp.estado IN ('finalizado', 'walkover')
        AND lp.ganador_id = j.id
    ) * 3
    + COUNT(lp.id) FILTER (
        WHERE lp.deleted_at IS NULL
          AND lp.estado = 'finalizado'
          AND lp.ganador_id IS NOT NULL
          AND lp.ganador_id <> j.id
      ) * 1,
    0
  ) AS pts,

  -- Sets a favor (solo partidos finalizados; el walkover no tiene sets reales)
  COALESCE(SUM(
    CASE WHEN lp.jugador_a_id = j.id THEN lp.sets_a ELSE lp.sets_b END
  ) FILTER (
    WHERE lp.deleted_at IS NULL AND lp.estado = 'finalizado'
  ), 0) AS sf,

  -- Sets en contra
  COALESCE(SUM(
    CASE WHEN lp.jugador_a_id = j.id THEN lp.sets_b ELSE lp.sets_a END
  ) FILTER (
    WHERE lp.deleted_at IS NULL AND lp.estado = 'finalizado'
  ), 0) AS sc,

  -- Diferencia de sets (SF − SC)
  COALESCE(SUM(
    CASE WHEN lp.jugador_a_id = j.id THEN lp.sets_a ELSE lp.sets_b END
  ) FILTER (
    WHERE lp.deleted_at IS NULL AND lp.estado = 'finalizado'
  ), 0)
  - COALESCE(SUM(
    CASE WHEN lp.jugador_a_id = j.id THEN lp.sets_b ELSE lp.sets_a END
  ) FILTER (
    WHERE lp.deleted_at IS NULL AND lp.estado = 'finalizado'
  ), 0) AS ds

FROM liga_division_jugadores ldj
JOIN jugadores j ON j.id = ldj.jugador_id
LEFT JOIN liga_partidos lp
  ON  lp.division_id = ldj.division_id
  AND (lp.jugador_a_id = j.id OR lp.jugador_b_id = j.id)
GROUP BY ldj.division_id, j.id, j.nombre;

-- Se vuelve a declarar por las dudas: CREATE OR REPLACE VIEW conserva las
-- opciones, pero esta es la vista que en la 137 entregaba los nombres de los
-- jugadores de los cuatro clubes a cualquiera con la llave pública. No es un
-- lugar donde valga la pena confiar en un comportamiento implícito.
ALTER VIEW public.division_ranking SET (security_invoker = on);

COMMENT ON VIEW public.division_ranking IS
  'security_invoker=on desde la 137. Desde la 229, ganados y puntos exigen el mismo cierre que jugados. La tabla que ve la aplicación NO sale de acá: la calcula calcularRankingDivision en src/lib/domain/liga.ts, que además desempata por enfrentamiento directo.';

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) security_invoker sigue puesto: debe aparecer en reloptions.
SELECT relname, reloptions
FROM pg_class WHERE relname = 'division_ranking';

-- 2) Ya no puede haber más ganados que jugados en ninguna división: cero filas.
SELECT division_id, jugador_id, nombre, pj, pg, pp
FROM division_ranking
WHERE pg > pj OR pp > pj OR (pg + pp) > pj;

-- 3) Comparación contra la tabla real, por si alguna división cambió de números
--    respecto de lo que la vista mostraba antes.
SELECT division_id, count(*) AS jugadores, sum(pj) AS partidos_jugados, sum(pts) AS puntos
FROM division_ranking
GROUP BY division_id
ORDER BY division_id;
