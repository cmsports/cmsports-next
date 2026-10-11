-- Auditoría de torneos: pagos contabilizados inmutables, premios una sola vez
-- y traspaso que cuenta y marca exactamente las mismas filas bloqueadas.
-- No modifica datos existentes. Aplicación MANUAL, después de revisar.
BEGIN;
SELECT _migracion_nueva('303_torneos_integridad_financiera');
SELECT _migracion_para_todos_los_clubes(
  'protege la integridad del motor financiero compartido de torneos; no cambia datos existentes');

CREATE OR REPLACE FUNCTION public._proteger_pago_torneo_contabilizado()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.subido_a_finanzas AND (
    NEW.estado IS DISTINCT FROM OLD.estado OR
    NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago OR
    NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago OR
    NEW.subido_a_finanzas IS DISTINCT FROM OLD.subido_a_finanzas OR
    NEW.torneo_id IS DISTINCT FROM OLD.torneo_id OR
    NEW.jugador_id IS DISTINCT FROM OLD.jugador_id
  ) THEN
    RAISE EXCEPTION 'Este pago ya está en Finanzas. Registra la corrección o devolución desde Finanzas.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._proteger_pago_torneo_contabilizado() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER torneo_pago_contabilizado_inmutable
BEFORE UPDATE ON public.torneo_pagos
FOR EACH ROW EXECUTE FUNCTION public._proteger_pago_torneo_contabilizado();

-- El UPDATE del RPC bloquea la fila del torneo. Incluso dos llamadas con
-- claves de idempotencia distintas se serializan aquí: la segunda aborta
-- antes de insertar otros movimientos. Repetir la MISMA clave sigue
-- devolviendo el resultado guardado, sin volver a ejecutar este UPDATE.
CREATE OR REPLACE FUNCTION public._proteger_premios_torneo_registrados()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.premio_primero IS NOT NULL OR OLD.premio_segundo IS NOT NULL
     OR OLD.premio_tercero IS NOT NULL OR OLD.premio_consuelo IS NOT NULL THEN
    RAISE EXCEPTION 'Los premios ya están registrados en Finanzas. No se pueden enviar nuevamente.';
  END IF;
  IF NEW.premio_primero < 0 OR NEW.premio_segundo < 0
     OR NEW.premio_tercero < 0 OR NEW.premio_consuelo < 0 THEN
    RAISE EXCEPTION 'Los premios no pueden ser negativos.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._proteger_premios_torneo_registrados() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER torneo_premios_sin_reenvio
BEFORE UPDATE OF premio_primero, premio_segundo, premio_tercero, premio_consuelo ON public.torneos
FOR EACH ROW EXECUTE FUNCTION public._proteger_premios_torneo_registrados();

-- No sustituir el RPC entero por una copia del repositorio: puede haber
-- cambios en producción. Se modifica su definición ACTUAL y se exige que
-- coincidan los tres puntos de inserción. Cualquier divergencia aborta toda
-- la migración, para revisar el RPC antes de aplicar el ajuste.
DO $patch$
DECLARE
  definicion text := pg_get_functiondef('public.subir_pagos_torneo_a_finanzas_atomico(uuid,uuid[],uuid)'::regprocedure);
  declaracion text := 'v_torneo_nombre text; v_cuota integer;';
  bloqueo text := 'PERFORM pg_advisory_xact_lock(hashtextextended(''torneo_pagos_finanzas:'' || p_torneo_id::text, 0));';
  filtro text := 'WHERE torneo_id = p_torneo_id AND estado = ''pagado'' AND subido_a_finanzas = false
    AND (p_jugador_ids IS NULL OR jugador_id = ANY(p_jugador_ids))';
BEGIN
  IF (length(definicion) - length(replace(definicion, declaracion, ''))) / length(declaracion) <> 1
     OR (length(definicion) - length(replace(definicion, bloqueo, ''))) / length(bloqueo) <> 1
     OR (length(definicion) - length(replace(definicion, filtro, ''))) / length(filtro) <> 2 THEN
    RAISE EXCEPTION 'El RPC de traspaso difiere del patrón revisado. No se aplicó ningún cambio: revisar su definición actual.';
  END IF;
  definicion := replace(definicion, declaracion, declaracion || ' v_pagos_bloqueados uuid[];');
  definicion := replace(definicion, filtro, 'WHERE id = ANY(v_pagos_bloqueados)');
  definicion := replace(definicion, bloqueo, bloqueo || E'\n' || '
  SELECT array_agg(p.id) INTO v_pagos_bloqueados
  FROM (
    SELECT id FROM public.torneo_pagos
    WHERE torneo_id = p_torneo_id AND estado = ''pagado'' AND subido_a_finanzas = false
      AND (p_jugador_ids IS NULL OR jugador_id = ANY(p_jugador_ids))
    ORDER BY id FOR UPDATE
  ) p;');
  EXECUTE definicion;
END;
$patch$;
COMMIT;
