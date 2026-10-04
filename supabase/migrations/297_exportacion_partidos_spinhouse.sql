-- Spinhouse: descarga de partidos CSV/JSON y parciales de torneos desde ahora.
-- La columna nace NULL; no se reconstruyen parciales históricos. El guardado
-- y la limpieza de parciales se activan exclusivamente por este módulo.
BEGIN;
SELECT _migracion_nueva('297_exportacion_partidos_spinhouse');
SELECT _migracion_para_club('Spinhouse');

ALTER TABLE public.torneo_partidos
  ADD COLUMN IF NOT EXISTS parciales jsonb;
COMMENT ON COLUMN public.torneo_partidos.parciales IS
  'Detalle set a set [[11,9],[11,7],...], para clubes con exportacion_partidos. NULL si no fue registrado; no inferirlo de los totales.';

-- Cualquier corrección (incluidos los RPC de llaves) invalida los parciales
-- anteriores si cambia un lado, el ganador o el marcador sin reemplazarlos.
-- El trigger no modifica resultados ni columnas de otros clubes.
CREATE OR REPLACE FUNCTION public.limpiar_parciales_torneo_exportable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.torneos t JOIN public.clubes c ON c.id = t.club_id
    WHERE t.id = NEW.torneo_id
      AND 'exportacion_partidos' = ANY(COALESCE(c.modulos_habilitados, ARRAY[]::text[]))
  ) THEN
    IF NEW.ganador IS NULL OR (
      NEW.parciales IS NOT DISTINCT FROM OLD.parciales AND (
        NEW.jugador_a IS DISTINCT FROM OLD.jugador_a
        OR NEW.jugador_b IS DISTINCT FROM OLD.jugador_b
        OR NEW.jugador_a2 IS DISTINCT FROM OLD.jugador_a2
        OR NEW.jugador_b2 IS DISTINCT FROM OLD.jugador_b2
        OR NEW.ganador IS DISTINCT FROM OLD.ganador
        OR NEW.sets_a IS DISTINCT FROM OLD.sets_a
        OR NEW.sets_b IS DISTINCT FROM OLD.sets_b
        OR NEW.puntos_a IS DISTINCT FROM OLD.puntos_a
        OR NEW.puntos_b IS DISTINCT FROM OLD.puntos_b
      )
    ) THEN NEW.parciales := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER limpiar_parciales_torneo_exportable
  BEFORE UPDATE ON public.torneo_partidos
  FOR EACH ROW EXECUTE FUNCTION public.limpiar_parciales_torneo_exportable();

UPDATE public.clubes
SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'exportacion_partidos')
WHERE id = current_setting('cmsports.club_declarado', true)::uuid
  AND NOT ('exportacion_partidos' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;
