-- ────────────────────────────────────────────────────────────
-- Mismo bug de la migración 213 (`limpiarExternosDeTorneo`, ver el
-- encabezado de esa migración para la explicación completa), pero en otros
-- dos torneos que no se habían revisado: "60 a 69" (alejandro muñoz, grupo
-- B) y "70+" (juan oyarce, grupo B). Los dos ya están 'finalizado', así que
-- nadie lo iba a notar mirando el cuadro — se encontró con esta consulta:
--
-- SELECT t.nombre, tg.nombre, j.nombre
-- FROM torneo_partidos tp
-- JOIN torneos t ON t.id = tp.torneo_id AND t.club_id = 'ec1ef215-...'
-- JOIN torneo_grupos tg ON tg.id = tp.grupo_id
-- JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
-- WHERE tp.fase = 'grupos'
-- AND NOT EXISTS (SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id);
--
-- En vez de repetir la migración 213 una vez por torneo, esta cubre TODOS
-- los torneos de Asociación Buin y Paine con el mismo patrón — incluida
-- TC, aunque ya se reparó en la 213: la condición `NOT EXISTS` hace que
-- ahí no encuentre nada que reponer, así que no pasa nada si corre de
-- nuevo sobre ese torneo.
--
-- No borra nada. Mismo criterio que la 213: el `grupo_id` sale del propio
-- partido (si sigue ligado a un grupo que existe hoy, es su grupo real),
-- `club_procedencia` queda NULL por lo mismo (dato cosmético, no hay de
-- dónde recuperarlo).
--
-- Alcance: SOLO club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
-- (Asociación TDM Buin y Paine). No toca otros clubes.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('214_recuperar_grupo_jugadores_buin_general');

-- ══ Verificación previa: qué torneos y quiénes se van a reponer ═══════════
DO $$
DECLARE v_fila record; v_total integer := 0;
BEGIN
  FOR v_fila IN
    SELECT DISTINCT t.nombre AS torneo, tg.nombre AS grupo, j.nombre AS jugador
    FROM torneo_partidos tp
    JOIN torneos t ON t.id = tp.torneo_id AND t.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    JOIN torneo_grupos tg ON tg.id = tp.grupo_id
    JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
    WHERE tp.fase = 'grupos'
      AND NOT EXISTS (
        SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id
      )
    ORDER BY 1, 2, 3
  LOOP
    v_total := v_total + 1;
    RAISE NOTICE '% — % — grupo %', v_fila.torneo, v_fila.jugador, v_fila.grupo;
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
    JOIN torneos t ON t.id = tp.torneo_id AND t.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    JOIN torneo_grupos tg ON tg.id = tp.grupo_id
    JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
    WHERE tp.fase = 'grupos'
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

-- 1) Ya no debería quedar ningún jugador de fase 'grupos' sin fila en grupo_jugadores, en ningún torneo de Buin.
SELECT t.nombre AS torneo, tg.nombre AS grupo, j.nombre AS jugador
FROM torneo_partidos tp
JOIN torneos t ON t.id = tp.torneo_id AND t.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
JOIN torneo_grupos tg ON tg.id = tp.grupo_id
JOIN jugadores j ON j.id IN (tp.jugador_a, tp.jugador_b)
WHERE tp.fase = 'grupos'
  AND NOT EXISTS (SELECT 1 FROM grupo_jugadores gj WHERE gj.grupo_id = tp.grupo_id AND gj.jugador_id = j.id);
-- Tiene que devolver 0 filas.

-- 2) Los repuestos en esta corrida.
SELECT t.nombre AS torneo, tg.nombre AS grupo, j.nombre AS jugador, gj.orden
FROM grupo_jugadores gj
JOIN torneo_grupos tg ON tg.id = gj.grupo_id
JOIN torneos t ON t.id = tg.torneo_id
JOIN jugadores j ON j.id = gj.jugador_id
WHERE t.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND j.nombre IN ('alejandro muñoz','juan oyarce')
ORDER BY t.nombre, tg.nombre, j.nombre;
-- Tiene que devolver 2 filas.
