-- ============================================================
-- CmSports — Vista de ranking por división (fuente única de verdad)
-- ============================================================
-- Derivado en vivo desde liga_partidos. El frontend solo lee
-- esta vista; nunca se guarda el ranking "a mano".
-- Desempates en cascada: pts → pg → ds → sf → (enfrentamiento directo
-- se resuelve en el frontend con los mismos datos de la vista).
-- ============================================================

CREATE OR REPLACE VIEW division_ranking AS
SELECT
  ldj.division_id,
  j.id     AS jugador_id,
  j.nombre AS nombre,

  -- Partidos jugados (finalizados o walkover)
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.estado IN ('finalizado', 'walkover')
  ) AS pj,

  -- Partidos ganados
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.ganador_id = j.id
  ) AS pg,

  -- Partidos perdidos
  COUNT(lp.id) FILTER (
    WHERE lp.deleted_at IS NULL
      AND lp.estado IN ('finalizado', 'walkover')
      AND lp.ganador_id IS NOT NULL
      AND lp.ganador_id <> j.id
  ) AS pp,

  -- Puntos: victoria = 3, derrota en finalizado = 1, derrota en walkover = 0
  COALESCE(
    COUNT(lp.id) FILTER (
      WHERE lp.deleted_at IS NULL AND lp.ganador_id = j.id
    ) * 3
    + COUNT(lp.id) FILTER (
        WHERE lp.deleted_at IS NULL
          AND lp.estado = 'finalizado'
          AND lp.ganador_id IS NOT NULL
          AND lp.ganador_id <> j.id
      ) * 1,
    0
  ) AS pts,

  -- Sets a favor (solo partidos finalizados, no walkover)
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
