-- ────────────────────────────────────────────────────────────
-- Blindaje a nivel de base de datos para el bug de las migraciones 213/214:
-- que se pueda borrar a un jugador de un grupo (torneo) o de una división
-- (liga) mientras sus partidos jugados siguen apuntándole. Los candados que
-- se agregaron esta semana en el código (`limpiarExternosDeTorneo`,
-- `asignarJugadoresDivision`, `quitarJugadorDeGrupo`) impiden que el código
-- ACTUAL lo vuelva a hacer, pero dependen de que alguien se acuerde de poner
-- el mismo chequeo en cada función nueva que borre de estas tablas — y ya
-- vimos que eso falla. Esto lo cierra en la base: ningún código, presente o
-- futuro, ni una consulta manual desde el SQL Editor, puede saltárselo.
--
-- Qué hace: un trigger `BEFORE DELETE` en `grupo_jugadores` y en
-- `liga_division_jugadores` que revisa si el jugador que se está por borrar
-- todavía tiene un partido CON RESULTADO en ese mismo grupo/división. Si lo
-- tiene, el DELETE falla con una excepción — no hay forma de que la fila se
-- borre dejando el partido huérfano.
--
-- Qué NO bloquea: borrar el grupo/división/torneo/liga COMPLETO. Cuando se
-- borra todo junto (torneo_partidos antes que grupo_jugadores, o
-- liga_partidos antes que liga_division_jugadores), el partido ya no existe
-- al momento de borrar la fila de membresía, así que no hay nada que
-- orfanar y el trigger no encuentra nada que objetar. Por eso esta semana
-- también se reordenaron `eliminarTorneoDefinitivo`, `eliminarTorneosDelClub`
-- y `eliminarLiga` para borrar los partidos primero — `eliminarLigasDelClub`
-- en `superadmin.ts` ya lo hacía bien.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('215_blindaje_no_borrar_jugador_con_resultado');

-- ══ Torneos: grupo_jugadores ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _bloquear_borrado_grupo_jugadores_con_resultado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM torneo_partidos
    WHERE grupo_id = OLD.grupo_id
      AND (jugador_a = OLD.jugador_id OR jugador_b = OLD.jugador_id)
      AND ganador IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede sacar a este jugador del grupo: ya tiene partidos jugados con resultado. Si se está borrando el grupo o el torneo completo, hay que borrar primero torneo_partidos.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_borrado_grupo_jugadores_con_resultado ON grupo_jugadores;
CREATE TRIGGER trg_bloquear_borrado_grupo_jugadores_con_resultado
BEFORE DELETE ON grupo_jugadores
FOR EACH ROW EXECUTE FUNCTION _bloquear_borrado_grupo_jugadores_con_resultado();

-- ══ Liga: liga_division_jugadores ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION _bloquear_borrado_liga_division_jugadores_con_resultado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM liga_partidos
    WHERE division_id = OLD.division_id
      AND (jugador_a_id = OLD.jugador_id OR jugador_b_id = OLD.jugador_id)
      AND estado IN ('finalizado', 'walkover')
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede sacar a este jugador de la división: ya tiene partidos jugados. Si se está borrando la división o la liga completa, hay que borrar primero liga_partidos.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_borrado_liga_division_jugadores_con_resultado ON liga_division_jugadores;
CREATE TRIGGER trg_bloquear_borrado_liga_division_jugadores_con_resultado
BEFORE DELETE ON liga_division_jugadores
FOR EACH ROW EXECUTE FUNCTION _bloquear_borrado_liga_division_jugadores_con_resultado();

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Los dos triggers quedaron puestos.
SELECT tgname, tgrelid::regclass AS tabla
FROM pg_trigger
WHERE tgname IN ('trg_bloquear_borrado_grupo_jugadores_con_resultado', 'trg_bloquear_borrado_liga_division_jugadores_con_resultado');
-- Tiene que devolver 2 filas.

-- 2) Prueba real: esto tiene que FALLAR con la excepción de arriba (no borrar nada).
-- Ejecutar en un torneo/grupo que ya tenga algún partido jugado, reemplazando los ids:
-- DELETE FROM grupo_jugadores WHERE grupo_id = '...' AND jugador_id = '...';
