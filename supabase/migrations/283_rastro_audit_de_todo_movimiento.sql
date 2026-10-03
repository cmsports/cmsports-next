-- Todo movimiento de plata deja rastro en audit_log, lo cree quien lo cree.
--
-- CLAUDE.md dice que los RPC de plata dejan el rastro en `audit_log` —el que
-- salvó la recuperación de julio—, pero la auditoría del 2026-09-24 encontró
-- cuatro que insertan en `movimientos` sin escribirlo:
--
--   registrar_pago_liga_atomico            (039)
--   subir_pagos_torneo_a_finanzas_atomico  (137)
--   registrar_gastos_gestion_torneo_atomico(137)
--   guardar_premios_torneo_atomico         (271)
--
-- En vez de reescribir cada RPC —copiando definiciones del repo, que va atrás
-- de la base, y arriesgando pisar un cambio que solo está en producción— se
-- cubre en la tabla: un trigger DIFERIDO que corre al hacer COMMIT y, si el
-- movimiento todavía no tiene su fila en audit_log, la escribe.
--
-- Diferido es lo que importa. Los RPC que sí auditan insertan el movimiento y
-- DESPUÉS su fila de audit_log; un trigger inmediato llegaría antes y los
-- duplicaría. Al COMMIT ya están las dos y este no hace nada. Tampoco escribe
-- nada si el movimiento se borró en la misma transacción.
--
-- No toca ninguna fila existente: solo cubre los movimientos que se creen de
-- acá en adelante.

BEGIN;
SELECT _migracion_nueva('283_rastro_audit_de_todo_movimiento');
SELECT _migracion_para_todos_los_clubes(
  'agrega un trigger de auditoría sobre movimientos de todos los clubes; no escribe ni cambia ninguna fila existente');

-- La búsqueda "¿ya tiene rastro?" corre una vez por movimiento: sin índice
-- recorrería audit_log entero en cada pago.
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public._auditar_movimiento_sin_rastro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- audit_log exige club_id (041); un movimiento sin club no se puede anotar.
  IF NEW.club_id IS NULL THEN RETURN NULL; END IF;

  -- Borrado antes del COMMIT: no hay nada que dejar anotado.
  IF NOT EXISTS (SELECT 1 FROM public.movimientos WHERE id = NEW.id) THEN RETURN NULL; END IF;

  -- El RPC ya lo anotó: no duplicar.
  IF EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE entity_type = 'movimientos' AND entity_id = NEW.id
  ) THEN RETURN NULL; END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (NEW.club_id, 'movimientos', NEW.id, 'crear',
    jsonb_build_object(
      'tipo', NEW.tipo, 'categoria', NEW.categoria, 'monto', NEW.monto,
      'fecha', NEW.fecha, 'descripcion', NEW.descripcion,
      'jugador_id', NEW.jugador_id, 'torneo_id', NEW.torneo_id,
      'origen', 'trigger_283'),
    auth.uid());
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._auditar_movimiento_sin_rastro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS movimientos_rastro_audit ON public.movimientos;
CREATE CONSTRAINT TRIGGER movimientos_rastro_audit
  AFTER INSERT ON public.movimientos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public._auditar_movimiento_sin_rastro();

COMMIT;


-- ── Verificación (solo lee) ───────────────────────────────────────────────
-- 1) El trigger existe y es diferido: una fila, tgdeferrable = true.
SELECT tgname, tgdeferrable, tginitdeferred
FROM pg_trigger WHERE tgname = 'movimientos_rastro_audit';

-- 2) Después del próximo pago de liga o de torneo, debería aparecer acá
--    con origen 'trigger_283':
-- SELECT created_at, after->>'categoria', after->>'monto'
-- FROM audit_log WHERE after->>'origen' = 'trigger_283'
-- ORDER BY created_at DESC LIMIT 10;
