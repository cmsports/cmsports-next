-- ────────────────────────────────────────────────────────────
-- El torneo TC (Asociación TDM Buin y Paine, torneo_id
-- 20c01cd3-c6d0-4888-b29f-00e1649dd99d) perdió 8 jugadores de sus grupos sin
-- que nadie los sacara a mano.
--
-- ── Cómo se encontró ─────────────────────────────────────────────────────
-- La tarjeta de Control financiero mostraba Recaudado ($225.000) por encima
-- de la Meta ($185.000 = 37 inscritos × cuota) — 45 pagos 'pagado' contra
-- solo 37 inscritos hoy. Y varios grupos mostraban partidos "vs —" ya
-- jugados, con ganador marcado, contra un rival sin nombre.
--
-- La causa está en el código, no es manipulación de nadie:
-- `finalizarTorneo` (actions/torneos.ts:1353) dispara al completar la final
-- `limpiarExternosDeTorneo` (línea 1383), que borra de `grupo_jugadores` a
-- todo jugador externo que no sea campeón ni subcampeón — sin mirar si ya
-- jugó partidos — y después intenta borrar también su ficha de `jugadores`.
-- Ese segundo borrado falló en silencio (`.catch(() => {})`, "best-effort")
-- porque `torneo_pagos` todavía los referenciaba. Como la ficha no llegó a
-- borrarse, el `ON DELETE SET NULL` de `torneo_partidos` que el comentario
-- de esa función asume nunca se disparó: los partidos quedaron con
-- `jugador_a`/`jugador_b`/`ganador` apuntando a alguien que ya no tiene fila
-- en `grupo_jugadores`. `calcularStats` (cliente) solo cuenta jugadores que
-- están en `grupo_jugadores`, así que esas victorias dejaron de contar para
-- la tabla de posiciones sin que se borrara ni un resultado.
--
-- Después alguien usó "reiniciar bracket" para reabrir el torneo a fase de
-- grupos — por eso hoy se ve un cuadro activo otra vez —, pero esa función
-- no repara el borrado de `grupo_jugadores`: los 8 quedaron perdidos.
--
-- ── Qué hace esta migración ────────────────────────────────────────────────
-- No borra nada. Busca, dentro de `torneo_partidos` de ESTE torneo, todo
-- jugador que aparece en fase 'grupos' pero no tiene fila en
-- `grupo_jugadores` para ese mismo grupo, y le repone la fila. El `grupo_id`
-- sale del propio partido: si el partido sigue ligado a un grupo que existe
-- hoy, es que ese es su grupo real (los partidos huérfanos de una reversión
-- de "reiniciar bracket" ya no matchean ningún grupo actual y quedan afuera
-- solos, por el INNER JOIN).
--
-- `club_procedencia` queda NULL: no hay ningún registro histórico de qué
-- club puso cada uno de estos 8 al inscribirse (no es un dato financiero, no
-- pasa por audit_log). Es cosmético — un badge de club en la tarjeta del
-- jugador — no afecta el resultado ni la clasificación. Se puede completar
-- a mano después si el club recuerda de dónde venía cada uno.
--
-- Alcance: SOLO el torneo TC de Asociación Buin y Paine. No toca ningún otro
-- torneo ni ningún otro club.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('213_recuperar_grupo_jugadores_torneo_tc');

-- ══ Verificación previa: cuántos y quiénes se van a reponer ═══════════════
DO $$
DECLARE v_fila record; v_total integer := 0;
BEGIN
  FOR v_fila IN
    SELECT DISTINCT tg.nombre AS grupo, j.nombre AS jugador
    FROM torneo_partidos tp
    JOIN torneo_grupos tg ON tg.id = tp.grupo_id AND tg.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
    JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
    WHERE tp.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
      AND tp.fase = 'grupos'
      AND NOT EXISTS (
        SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id
      )
    ORDER BY 1, 2
  LOOP
    v_total := v_total + 1;
    RAISE NOTICE '% — grupo %', v_fila.jugador, v_fila.grupo;
  END LOOP;
  RAISE NOTICE 'Total a reponer: %', v_total;
END $$;

-- ══ Reponer, uno por uno, para que el orden dentro del grupo no choque ════
DO $$
DECLARE
  v_fila record;
  v_orden integer;
BEGIN
  FOR v_fila IN
    SELECT DISTINCT tp.grupo_id, j.id AS jugador_id
    FROM torneo_partidos tp
    JOIN torneo_grupos tg ON tg.id = tp.grupo_id AND tg.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
    JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
    WHERE tp.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
      AND tp.fase = 'grupos'
      AND NOT EXISTS (
        SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id
      )
  LOOP
    SELECT COALESCE(MAX(orden), 0) + 1 INTO v_orden FROM grupo_jugadores WHERE grupo_id = v_fila.grupo_id;
    INSERT INTO grupo_jugadores (grupo_id, jugador_id, orden, club_procedencia)
    VALUES (v_fila.grupo_id, v_fila.jugador_id, v_orden, NULL);
  END LOOP;
END $$;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Ya no debería quedar ningún jugador de fase 'grupos' sin fila en grupo_jugadores.
SELECT tg.nombre AS grupo, j.nombre AS jugador
FROM torneo_partidos tp
JOIN torneo_grupos tg ON tg.id = tp.grupo_id AND tg.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
WHERE tp.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
  AND tp.fase = 'grupos'
  AND NOT EXISTS (SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id);
-- Tiene que devolver 0 filas.

-- 2) Los 8 repuestos, con su grupo.
SELECT tg.nombre AS grupo, j.nombre AS jugador, gj.orden
FROM grupo_jugadores gj
JOIN torneo_grupos tg ON tg.id = gj.grupo_id
JOIN jugadores j ON j.id = gj.jugador_id
WHERE tg.torneo_id = '20c01cd3-c6d0-4888-b29f-00e1649dd99d'
  AND j.nombre IN ('José Rebolledo','gonzalo robles','rodrigo tilleras','andres tilleras','marco bastias','jonathan torres','pablo dufre','bastian carrasco')
ORDER BY tg.nombre, j.nombre;
-- Tiene que devolver 8 filas, una por grupo (H, C, K, L, F, B, B, E).
