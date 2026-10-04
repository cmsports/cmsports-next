-- SOLO Spinhouse: padrón real, independiente de los cambios de bloque.
-- Requiere 294 (retencion_estado / retencion_eventos). Sin reconstruir históricos.
-- No elimina datos: reemplaza únicamente el CHECK para aceptar dos tipos nuevos.
-- EJECUCIÓN MANUAL: SQL Editor de Supabase. Aplicada el: ____________
BEGIN;
SELECT _migracion_nueva('298_spinhouse_indicador_permanencia');
SELECT _migracion_para_club('Spinhouse');

ALTER TABLE public.retencion_eventos ADD COLUMN IF NOT EXISTS fecha date;
ALTER TABLE public.retencion_eventos DROP CONSTRAINT IF EXISTS retencion_eventos_tipo_check;
ALTER TABLE public.retencion_eventos ADD CONSTRAINT retencion_eventos_tipo_check
  CHECK (tipo IN ('inactivo','reingreso','bloqueo_mora','desbloqueo_mora','alta','retiro'));

COMMENT ON COLUMN public.retencion_eventos.fecha IS
  'Fecha declarada del retiro/reingreso; NULL usa ocurrido_en en hora de Chile. Altas se registran prospectivamente, no se deducen de bloques.';

-- Las altas reales posteriores a la activación, incluido ingreso por solicitud.
-- Un competidor externo de un torneo no ingresa al padrón del club.
CREATE OR REPLACE FUNCTION public._registrar_alta_padron()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.es_externo, false) OR NEW.club_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.clubes c WHERE c.id = NEW.club_id
    AND COALESCE('indicador_bajas_club' = ANY(c.modulos_habilitados), false)) THEN
    INSERT INTO public.retencion_eventos(club_id, jugador_id, tipo, ocurrido_en, fecha, motivo)
    VALUES (NEW.club_id, NEW.id, 'alta', now(), (now() AT TIME ZONE 'America/Santiago')::date,
      'Alta de jugador en el padrón del club');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._registrar_alta_padron() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER registrar_alta_padron AFTER INSERT ON public.jugadores
  FOR EACH ROW EXECUTE FUNCTION public._registrar_alta_padron();

-- El RPC verifica club/módulo/rol y serializa contra la automatización.
-- No cambia jugadores.estado ni la historia de bloques ni registros financieros.
CREATE OR REPLACE FUNCTION public.registrar_permanencia_jugador(
  p_jugador_id uuid, p_tipo text, p_fecha date, p_motivo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_jugador public.jugadores%ROWTYPE;
  v_estado public.retencion_estado%ROWTYPE;
  v_ultima_fecha date;
  v_id uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT club_id INTO v_club FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin';
  IF v_club IS NULL THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubes c WHERE c.id = v_club
    AND COALESCE('indicador_bajas_club' = ANY(c.modulos_habilitados), false)) THEN
    RAISE EXCEPTION 'Historial de permanencia no habilitado para este club';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('retiro','reingreso') OR p_fecha IS NULL OR p_fecha > v_hoy THEN
    RAISE EXCEPTION 'Movimiento o fecha inválida';
  END IF;
  IF p_motivo IS NULL OR char_length(trim(p_motivo)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Indica un motivo de hasta 500 caracteres';
  END IF;
  SELECT * INTO v_jugador FROM public.jugadores WHERE id = p_jugador_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_jugador.es_externo, false) THEN RAISE EXCEPTION 'Jugador ajeno al padrón del club'; END IF;
  IF p_fecha < COALESCE((v_jugador.creado_en AT TIME ZONE 'America/Santiago')::date, p_fecha) THEN
    RAISE EXCEPTION 'La fecha es anterior al alta del jugador';
  END IF;
  SELECT max(COALESCE(fecha, (ocurrido_en AT TIME ZONE 'America/Santiago')::date)) INTO v_ultima_fecha
    FROM public.retencion_eventos WHERE club_id = v_club AND jugador_id = p_jugador_id
      AND tipo IN ('alta','retiro','inactivo','reingreso');
  IF v_ultima_fecha IS NOT NULL AND p_fecha < v_ultima_fecha THEN
    RAISE EXCEPTION 'La fecha precede al último movimiento de permanencia';
  END IF;
  INSERT INTO public.retencion_estado(club_id,jugador_id) VALUES (v_club,p_jugador_id)
    ON CONFLICT (club_id,jugador_id) DO NOTHING;
  SELECT * INTO v_estado FROM public.retencion_estado
    WHERE club_id = v_club AND jugador_id = p_jugador_id FOR UPDATE;
  IF p_tipo = 'retiro' AND v_estado.inactivo THEN RAISE EXCEPTION 'El jugador ya figura inactivo'; END IF;
  IF p_tipo = 'reingreso' AND NOT v_estado.inactivo THEN RAISE EXCEPTION 'El jugador ya figura vigente'; END IF;
  UPDATE public.retencion_estado SET inactivo = (p_tipo = 'retiro'), retirado_manual = (p_tipo = 'retiro'), actualizado_en = now()
    WHERE club_id = v_club AND jugador_id = p_jugador_id;
  INSERT INTO public.retencion_eventos(club_id,jugador_id,tipo,fecha,motivo)
    VALUES(v_club,p_jugador_id,p_tipo,p_fecha,trim(p_motivo)) RETURNING id INTO v_id;
  INSERT INTO public.audit_log(club_id,entity_type,entity_id,action,after,user_id)
    VALUES(v_club,'retencion',p_jugador_id,p_tipo,
      jsonb_build_object('fecha',p_fecha,'motivo',trim(p_motivo),'origen','declaracion_admin'),auth.uid());
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_permanencia_jugador(uuid,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_permanencia_jugador(uuid,text,date,text) TO authenticated;

UPDATE public.clubes
SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'indicador_bajas_club')
WHERE id = (SELECT id FROM public.clubes WHERE nombre = 'Spinhouse')
  AND NOT COALESCE('indicador_bajas_club' = ANY(modulos_habilitados), false);
COMMIT;
