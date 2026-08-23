-- ────────────────────────────────────────────────────────────
-- torneo_pagos no tenía ninguna restricción que impidiera dos filas del
-- mismo jugador en el mismo torneo.
--
-- ── Cómo se encontró ─────────────────────────────────────────────────────
-- La tarjeta "Control financiero" del torneo TC mostraba "Pendiente: -$40.000"
-- (Meta $185.000, Recaudado $225.000, 37 inscritos). Se sospechó primero de
-- pagos duplicados inflando el recaudado. Se verificó con SQL: TC no tenía
-- ningún duplicado — la diferencia real era gente que pagó y luego salió del
-- cuadro (torneo_pagos no se toca al sacar a un jugador, a propósito, ver
-- `quitarJugadorDeGrupo` en actions/torneos.ts).
--
-- Pero la búsqueda club-wide sí encontró un duplicado real, en otro torneo
-- ("60 a 69", 2026-08-23): un jugador con dos filas en estado 'pendiente',
-- nunca subidas a Finanzas. Sin plata de por medio, pero confirma que la
-- base permite el duplicado.
--
-- Y el propio código ya sabía que podía pasar — comentario en
-- `actualizarEstadoPago` (actions/torneos.ts): "delete duplicates then
-- upsert — prevents race condition on rapid clicks". Ese parche solo limpia
-- al jugador que se está tocando en ese momento; un duplicado de otra
-- interacción queda ahí para siempre.
--
-- El riesgo real: `subir_pagos_torneo_a_finanzas_atomico` (migración 137)
-- cuenta FILAS con estado = 'pagado', no personas distintas. Si algún día un
-- duplicado con estado 'pagado' llega a subirse, crea un ingreso inflado de
-- verdad en `movimientos`. Hoy eso no ha pasado — se verificó que ningún
-- duplicado tiene subido_a_finanzas = true —, pero la puerta seguía abierta.
--
-- ── Qué hace esta migración ────────────────────────────────────────────────
-- 1. Respalda TODAS las filas que participan en algún duplicado (por
--    torneo_id + jugador_id, sin filtrar por estado: dos filas del mismo
--    jugador con estados distintos también cuentan).
-- 2. Se queda con UNA fila por (torneo_id, jugador_id): prioriza 'pagado'
--    sobre 'exento' sobre 'pendiente' (nunca se borra evidencia de un pago
--    real a favor de una fila vacía), y a igualdad de estado, la más
--    antigua — mismo criterio que ya usa `actualizarEstadoPago`.
-- 3. Agrega la restricción única que debió existir desde el principio, para
--    que el duplicado deje de ser posible.
--
-- No toca ninguna fila que esté sola (sin duplicado). No borra plata: se
-- verificó antes de escribir esto que ningún duplicado llegó a Finanzas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('212_torneo_pagos_sin_duplicados');

-- ══ 1. Respaldo — nombre único, sin IF NOT EXISTS a propósito ═════════════
-- Si esta migración se pega dos veces, la segunda pasada revienta acá con
-- "relation already exists" y no llega a borrar nada: el error es la
-- protección (ver docs/migraciones-destructivas.md).
CREATE TABLE _respaldo_torneo_pagos_duplicados_20260823 AS
SELECT tp.*
FROM torneo_pagos tp
WHERE (tp.torneo_id, tp.jugador_id) IN (
  SELECT torneo_id, jugador_id
  FROM torneo_pagos
  GROUP BY torneo_id, jugador_id
  HAVING count(*) > 1
);

-- Se registra en la política de retención (migración 207): toda tabla
-- _respaldo_* nueva tiene que anotarse ahí en la misma transacción, o
-- _respaldos_vencidos() nunca la va a ver y queda viva para siempre.
-- 90 días: no es evidencia de un incidente con plata real (se verificó que
-- ningún duplicado llegó a Finanzas), es solo el respaldo de una limpieza.
INSERT INTO _respaldo_politica_retencion (tabla, retener_hasta, motivo) VALUES
  ('_respaldo_torneo_pagos_duplicados_20260823', (now() AT TIME ZONE 'America/Santiago')::date + 90,
   'Filas de torneo_pagos duplicadas por la falta de restricción única en (torneo_id, jugador_id), encontradas al investigar un "Pendiente" negativo en el reporte de torneos. Ningún duplicado tenía estado pagado con subido_a_finanzas = true: no hay plata real de por medio. Retención estándar de 90 días. Ver migración 212.')
ON CONFLICT (tabla) DO NOTHING;

-- ══ 2. Verificación previa: el número tiene que ser coherente ═════════════
-- Si esto da 0, no hay nada que limpiar y el paso 3 no va a borrar nada
-- (la condición es la misma en los dos lados).
DO $$
DECLARE v_filas integer; v_grupos integer;
BEGIN
  SELECT count(*) INTO v_filas FROM _respaldo_torneo_pagos_duplicados_20260823;
  SELECT count(*) INTO v_grupos FROM (
    SELECT torneo_id, jugador_id FROM _respaldo_torneo_pagos_duplicados_20260823
    GROUP BY torneo_id, jugador_id
  ) g;
  RAISE NOTICE 'Duplicados encontrados: % filas en % pares (torneo, jugador).', v_filas, v_grupos;
END $$;

-- ══ 3. Quedarse con UNA fila por (torneo_id, jugador_id) ══════════════════
-- Prioridad para decidir cuál se conserva: pagado > exento > pendiente,
-- y a igualdad de estado, la fila más antigua. Nunca se borra un 'pagado'
-- a favor de un 'pendiente' o 'exento'.
WITH rankeadas AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY torneo_id, jugador_id
      ORDER BY
        CASE estado WHEN 'pagado' THEN 0 WHEN 'exento' THEN 1 ELSE 2 END,
        creado_en ASC,
        id ASC
    ) AS orden
  FROM torneo_pagos
  WHERE (torneo_id, jugador_id) IN (
    SELECT torneo_id, jugador_id
    FROM torneo_pagos
    GROUP BY torneo_id, jugador_id
    HAVING count(*) > 1
  )
)
DELETE FROM torneo_pagos
WHERE id IN (SELECT id FROM rankeadas WHERE orden > 1);

-- ══ 4. La restricción que faltaba ══════════════════════════════════════════
-- Ya no puede fallar: el paso 3 dejó como máximo una fila por par.
ALTER TABLE torneo_pagos
  ADD CONSTRAINT torneo_pagos_torneo_jugador_uniq UNIQUE (torneo_id, jugador_id);

COMMENT ON CONSTRAINT torneo_pagos_torneo_jugador_uniq ON torneo_pagos IS
  'Un jugador no puede tener más de una fila de pago por torneo. Antes no existía esta restricción: actualizarEstadoPago tenía que borrar duplicados a mano en cada llamada (comentario "ponytail: prevents race condition on rapid clicks"), y un duplicado con estado pagado podía inflar el ingreso subido a Finanzas. Ver migración 212.';

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Cero duplicados restantes.
SELECT torneo_id, jugador_id, count(*)
FROM torneo_pagos
GROUP BY torneo_id, jugador_id
HAVING count(*) > 1;
-- Tiene que devolver 0 filas.

-- 2) La restricción quedó puesta.
SELECT conname FROM pg_constraint WHERE conname = 'torneo_pagos_torneo_jugador_uniq';
-- Tiene que devolver 1 fila.

-- 3) Qué se guardó en el respaldo, para archivo.
SELECT torneo_id, jugador_id, estado, subido_a_finanzas, creado_en
FROM _respaldo_torneo_pagos_duplicados_20260823
ORDER BY torneo_id, jugador_id, creado_en;
