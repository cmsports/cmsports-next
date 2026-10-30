-- Retirar a un jugador de un torneo en curso sin dejar partidos contra nadie.
--
-- ── El problema ───────────────────────────────────────────────────────────
-- `eliminar_jugador_atomico` borra a la persona y, en los partidos, solo le
-- pone NULL donde estaba su nombre. Si el jugador estaba en un grupo de un
-- torneo en curso, sus rivales quedaban con partidos "vs —" y el grupo con uno
-- menos, sin rearmar nada. Pasó en sub19 (2026-08-16, grupo E), TCB
-- (2026-09-06, grupo B) y TC A / TC B (2026-10-25). Las dos primeras siguen
-- con la cicatriz; ver docs/pegar-diagnostico-grupos-torneo.sql.
--
-- Rearmar los partidos es trabajo del módulo de torneos (la app), y la función
-- de la base no puede llamarlo. La app ahora retira al jugador del torneo ANTES
-- de borrarlo (sale del grupo y se rehacen los partidos, o queda con W.O. en lo
-- que le falte si ya había jugado). Esta migración pone lo que la app necesita
-- y un freno para cualquier camino que se lo salte.
--
-- ── Qué agrega ────────────────────────────────────────────────────────────
--  1. grupo_jugadores.retirado_en: el jugador se retiró del torneo. Sus partidos
--     jugados quedan; los pendientes, como W.O. para el rival; y no clasifica.
--  2. jugadores.borrar_al_finalizar_torneo: se pidió eliminarlo, pero ya había
--     jugado en un torneo en curso. La ficha se borra al finalizar ese torneo,
--     para no cambiar la tabla del grupo a mitad de camino.
--  3. Freno: ningún partido de GRUPO de un torneo en curso puede quedar con un
--     jugador en NULL. Lo único que hoy hace eso es eliminar_jugador_atomico,
--     así que borrar a alguien que sigue en un grupo vivo falla con un mensaje
--     en vez de dañar en silencio. Torneos finalizados, archivados o cancelados
--     no se frenan (ahí el borrado se comporta como siempre).
--  4. Registro: entrar, salir, cambiar de grupo o retirarse queda en audit_log
--     (quién, cuándo, de qué grupo a cuál). El 25-oct no se pudo reconstruir
--     nada porque esto no existía. Si el registro falla, NO frena la operación.
--
-- ── Por qué es para todos los clubes ─────────────────────────────────────
-- Son columnas, un trigger y un registro sobre tablas compartidas. No modifica
-- ninguna fila al aplicarse. Con la app publicada hoy, no cambia nada visible:
-- el botón de eliminar ya se niega antes de llegar al freno (desde el 26-oct),
-- y "Eliminar club" del superadmin solo tropezaría con un club que tenga un
-- torneo en curso (la app nueva borra los torneos antes que los jugadores).
--
-- ORDEN: pegar esta migración ANTES de subir la app nueva: la app lee
-- `retirado_en` y fallaría si la columna no existe.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-10-29 (verificado: 2 columnas y 3 triggers presentes)

BEGIN;
SELECT _migracion_nueva('306_retirar_jugador_de_torneo');
SELECT _migracion_para_todos_los_clubes('agrega dos columnas, un freno y un registro en tablas compartidas de torneos; no modifica filas al aplicar');


-- ══ 1 y 2. Las marcas ═════════════════════════════════════════════════════
ALTER TABLE public.grupo_jugadores
  ADD COLUMN IF NOT EXISTS retirado_en timestamptz;

ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS borrar_al_finalizar_torneo boolean NOT NULL DEFAULT false;


-- ══ 3. El freno ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._frenar_partido_de_grupo_sin_jugador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
BEGIN
  SELECT t.nombre INTO v_nombre
  FROM torneos t
  WHERE t.id = NEW.torneo_id
    AND COALESCE(t.estado, '') NOT IN ('finalizado', 'archivado', 'cancelado');

  IF FOUND THEN
    RAISE EXCEPTION 'El jugador sigue en un grupo del torneo en curso "%". Retíralo primero desde el torneo: así sus partidos se rehacen o quedan como W.O.', COALESCE(v_nombre, 'sin nombre')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_frenar_partido_de_grupo_sin_jugador ON public.torneo_partidos;
CREATE TRIGGER trg_frenar_partido_de_grupo_sin_jugador
BEFORE UPDATE OF jugador_a, jugador_b ON public.torneo_partidos
FOR EACH ROW
WHEN (
  NEW.fase = 'grupos'
  AND (
    (OLD.jugador_a IS NOT NULL AND NEW.jugador_a IS NULL)
    OR (OLD.jugador_b IS NOT NULL AND NEW.jugador_b IS NULL)
  )
)
EXECUTE FUNCTION public._frenar_partido_de_grupo_sin_jugador();


-- ══ 4. El registro ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._registrar_cambio_grupo_jugadores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club   uuid;
  v_torneo uuid;
  v_accion text;
BEGIN
  -- El registro nunca frena la operación: si algo falla acá, se avisa y sigue.
  BEGIN
    SELECT t.club_id, t.id INTO v_club, v_torneo
    FROM torneo_grupos g
    JOIN torneos t ON t.id = g.torneo_id
    WHERE g.id = COALESCE(NEW.grupo_id, OLD.grupo_id);

    -- Sin club no se registra: audit_log exige club_id, y pasa cuando se borra
    -- el torneo entero y el grupo ya no existe.
    IF v_club IS NOT NULL THEN
      v_accion := CASE
        WHEN TG_OP = 'INSERT' THEN 'entra_al_grupo'
        WHEN TG_OP = 'DELETE' THEN 'sale_del_grupo'
        WHEN OLD.grupo_id IS DISTINCT FROM NEW.grupo_id THEN 'cambia_de_grupo'
        WHEN NEW.retirado_en IS NOT NULL THEN 'se_retira'
        ELSE 'vuelve_al_torneo'
      END;

      INSERT INTO audit_log (club_id, entity_type, entity_id, action, before, after, user_id)
      VALUES (
        v_club,
        'grupo_jugadores',
        COALESCE(NEW.jugador_id, OLD.jugador_id),
        v_accion,
        CASE WHEN TG_OP <> 'INSERT'
          THEN jsonb_build_object('torneo_id', v_torneo, 'grupo_id', OLD.grupo_id, 'retirado_en', OLD.retirado_en) END,
        CASE WHEN TG_OP <> 'DELETE'
          THEN jsonb_build_object('torneo_id', v_torneo, 'grupo_id', NEW.grupo_id, 'retirado_en', NEW.retirado_en) END,
        CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se guardó el registro de grupo_jugadores: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_grupo_jugadores_entra_sale ON public.grupo_jugadores;
CREATE TRIGGER trg_registrar_grupo_jugadores_entra_sale
AFTER INSERT OR DELETE ON public.grupo_jugadores
FOR EACH ROW EXECUTE FUNCTION public._registrar_cambio_grupo_jugadores();

-- Solo cuando cambia de grupo o se retira. Reordenar (`orden`) y anotar
-- resultados (`partidos_ganados`) también actualizan esta tabla y no son un
-- cambio de quién está dónde.
DROP TRIGGER IF EXISTS trg_registrar_grupo_jugadores_cambia ON public.grupo_jugadores;
CREATE TRIGGER trg_registrar_grupo_jugadores_cambia
AFTER UPDATE OF grupo_id, retirado_en ON public.grupo_jugadores
FOR EACH ROW
WHEN (OLD.grupo_id IS DISTINCT FROM NEW.grupo_id OR OLD.retirado_en IS DISTINCT FROM NEW.retirado_en)
EXECUTE FUNCTION public._registrar_cambio_grupo_jugadores();

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo leen) ───────────

-- 1) Las dos columnas existen.
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE (table_name, column_name) IN (('grupo_jugadores', 'retirado_en'), ('jugadores', 'borrar_al_finalizar_torneo'));

-- 2) Los tres triggers quedaron puestos.
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE tgname IN ('trg_frenar_partido_de_grupo_sin_jugador',
--                  'trg_registrar_grupo_jugadores_entra_sale',
--                  'trg_registrar_grupo_jugadores_cambia');

-- 3) Después de usarlo en Demostración: lo que quedó registrado.
-- SELECT created_at, action, entity_id, before, after, user_id FROM audit_log
-- WHERE entity_type = 'grupo_jugadores' ORDER BY created_at DESC LIMIT 20;
