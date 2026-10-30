-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO DE GRUPOS DE TORNEO — Asociación TDM Buin y Paine
-- ════════════════════════════════════════════════════════════════════════════
--
-- SOLO LEE. No escribe, no borra, no cambia nada. Se pega entera en el SQL
-- Editor de Supabase y se corre una vez. Una fila por anomalía; sin filas es
-- que los grupos están sanos.
--
-- Busca las cinco huellas que puede dejar cada mecanismo conocido de fallo:
--
--   1  Partido con rival vacío .............. eliminar un jugador en pleno
--                                             torneo (eliminar_jugador_atomico)
--   2  Partido contra alguien que no está ... partidos rearmados con una lista
--      en el grupo                            de integrantes vieja
--   3  Integrante con partidos de menos o ... "el que llegó quedó sin partidos"
--      de más
--   4  Pareja repetida en el grupo .......... dos rearmados que se cruzaron
--   5  Jugador en más de un grupo ........... dos movimientos que se cruzaron
--
-- Solo mira torneos tradicionales y liguillas (las otras modalidades no tienen
-- grupos así), sin la MESA ni los grupos en preparación. La última columna dice
-- cuándo se crearon los partidos de ese grupo: es lo más cercano a un
-- registro, porque mover/quitar/reordenar no dejan rastro en audit_log.
--
-- Escrito el 2026-10-29 y probado contra datos sembrados en un Postgres local
-- (PGlite): detecta los cinco tipos y no marca un torneo sano, una liguilla a
-- dos ruedas, otro club ni la MESA. No es una migración: no lleva
-- _migracion_nueva.
-- ════════════════════════════════════════════════════════════════════════════

WITH
t AS (
  SELECT id, nombre, estado, fecha_inicio,
         COALESCE(formato, 'grupos') AS modalidad,
         GREATEST(COALESCE(ruedas, 1), 1) AS ruedas
  FROM torneos
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND COALESCE(formato, 'grupos') IN ('grupos', 'liguilla')
),
g AS (
  SELECT tg.id, tg.torneo_id, tg.nombre
  FROM torneo_grupos tg
  JOIN t ON t.id = tg.torneo_id
  WHERE tg.nombre <> 'MESA'
    AND NOT COALESCE(tg.en_preparacion, false)
),
m AS (
  SELECT gj.grupo_id, gj.jugador_id
  FROM grupo_jugadores gj
  JOIN g ON g.id = gj.grupo_id
),
p AS (
  SELECT tp.id, tp.grupo_id, tp.jugador_a, tp.jugador_b
  FROM torneo_partidos tp
  JOIN g ON g.id = tp.grupo_id
  WHERE tp.fase = 'grupos'
),
hallazgos AS (
  -- 1 · rival vacío
  SELECT '1 partido con rival vacío' AS problema, p.grupo_id,
         COALESCE(p.jugador_a, p.jugador_b) AS jugador_id,
         'partido ' || p.id::text AS detalle
  FROM p
  WHERE p.jugador_a IS NULL OR p.jugador_b IS NULL

  UNION ALL
  -- 2 · partido contra alguien que ya no es integrante
  SELECT '2 partido con alguien que no está en el grupo', p.grupo_id, x.jid,
         'partido ' || p.id::text
  FROM p
  CROSS JOIN LATERAL (VALUES (p.jugador_a), (p.jugador_b)) AS x(jid)
  WHERE x.jid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM m WHERE m.grupo_id = p.grupo_id AND m.jugador_id = x.jid)

  UNION ALL
  -- 3 · integrante con partidos de menos o de más
  SELECT '3 integrante con partidos de menos o de más', m.grupo_id, m.jugador_id,
         'tiene ' || COUNT(p.id) || ', le corresponden ' || ((n.cant - 1) * t.ruedas)
  FROM m
  JOIN g ON g.id = m.grupo_id
  JOIN t ON t.id = g.torneo_id
  JOIN (SELECT grupo_id, COUNT(*) AS cant FROM m GROUP BY grupo_id) n ON n.grupo_id = m.grupo_id
  LEFT JOIN p ON p.grupo_id = m.grupo_id AND (p.jugador_a = m.jugador_id OR p.jugador_b = m.jugador_id)
  GROUP BY m.grupo_id, m.jugador_id, n.cant, t.ruedas
  HAVING COUNT(p.id) <> (n.cant - 1) * t.ruedas

  UNION ALL
  -- 4 · la misma pareja más veces de las que corresponde
  SELECT '4 pareja repetida en el grupo', par.grupo_id, par.uno,
         'contra ' || COALESCE(otro.nombre, '?') || ': ' || par.veces || ' partidos, corresponden ' || par.ruedas
  FROM (
    SELECT p.grupo_id, t.ruedas,
           LEAST(p.jugador_a, p.jugador_b) AS uno,
           GREATEST(p.jugador_a, p.jugador_b) AS dos,
           COUNT(*) AS veces
    FROM p
    JOIN g ON g.id = p.grupo_id
    JOIN t ON t.id = g.torneo_id
    WHERE p.jugador_a IS NOT NULL AND p.jugador_b IS NOT NULL
    GROUP BY p.grupo_id, t.ruedas, LEAST(p.jugador_a, p.jugador_b), GREATEST(p.jugador_a, p.jugador_b)
  ) par
  LEFT JOIN jugadores otro ON otro.id = par.dos
  WHERE par.veces > par.ruedas

  UNION ALL
  -- 5 · el mismo jugador en dos grupos del mismo torneo
  SELECT '5 jugador en más de un grupo del torneo', (array_agg(m.grupo_id))[1], m.jugador_id,
         'está en ' || COUNT(*) || ' grupos'
  FROM m
  JOIN g ON g.id = m.grupo_id
  GROUP BY g.torneo_id, m.jugador_id
  HAVING COUNT(*) > 1
)
SELECT h.problema,
       t.nombre       AS torneo,
       t.estado,
       t.fecha_inicio,
       g.nombre       AS grupo,
       j.nombre       AS jugador,
       h.detalle,
       -- Tal como está en la base. Si termina en +00 es UTC: en Chile son
       -- 3 horas menos (horario de verano, desde septiembre).
       (SELECT max(tp.creado_en) FROM torneo_partidos tp WHERE tp.grupo_id = h.grupo_id) AS partidos_creados
FROM hallazgos h
JOIN g ON g.id = h.grupo_id
JOIN t ON t.id = g.torneo_id
LEFT JOIN jugadores j ON j.id = h.jugador_id
ORDER BY t.fecha_inicio DESC NULLS LAST, t.nombre, g.nombre, h.problema;
