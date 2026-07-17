-- ============================================================
-- CmSports — RLS, auditoría e integridad multi-club
-- ============================================================
-- Aplicar después de 038 (y de 039/040 si existen en el despliegue).
-- No elimina datos. Los controles NOT VALID preservan filas históricas
-- para que puedan revisarse antes de validar las restricciones.

BEGIN;

-- Preflight: 041 endurece estas funciones existentes. Si la cadena previa está
-- incompleta, aborta antes de alterar tablas, políticas, grants o triggers.
DO $$
DECLARE
  v_signature text;
  v_required_functions constant text[] := ARRAY[
    'public.get_my_rol()',
    'public.get_my_club_id()',
    'public.get_my_jugador_id()',
    'public.dashboard_kpis(uuid)',
    'public.generar_mensualidades(uuid,integer,integer)',
    'public.proteger_perfil()',
    'public.validar_invitacion(text,uuid)',
    'public.torneo_publico(text)',
    'public.solicitar_acceso_torneo(text,text,text)',
    'public.solicitar_inscripcion_torneo(text,text)',
    'public.obtener_club_asistencia(uuid)',
    'public.registrar_asistencia_rut(uuid,text)',
    'public.crear_solicitud_jugador(text,uuid,text,text,text,text)',
    'public.registrar_asistencia_segura(uuid,date,time without time zone)',
    'public.eliminar_asistencia_segura(uuid)',
    'public.cambiar_reserva_clase(uuid,boolean)',
    'public.contar_reservas_clases(uuid[])',
    'public.confirmar_feedback_jugador(uuid)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_required_functions LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION
        'RLS-041 preflight: falta la función %. Aplique las migraciones anteriores antes de 041.',
        v_signature;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 1. Auditoría aislada por club y no escribible por clientes
-- ------------------------------------------------------------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS club_id uuid;

-- Recupera el tenant de los eventos de pagos de liga existentes.
UPDATE public.audit_log al
SET club_id = l.club_id
FROM public.liga_jugador_pagos p
JOIN public.liga_divisiones d ON d.id = p.division_id
JOIN public.ligas l ON l.id = d.liga_id
WHERE al.club_id IS NULL
  AND al.entity_type = 'liga_jugador_pagos'
  AND al.entity_id = p.id;

-- Fallback para eventos históricos cuyo actor todavía pertenece a un club.
UPDATE public.audit_log al
SET club_id = perfil.club_id
FROM public.perfiles perfil
WHERE al.club_id IS NULL
  AND al.user_id = perfil.id
  AND perfil.club_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'audit_log_club_id_fkey'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubes(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'audit_log_club_id_present'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_club_id_present
      CHECK (club_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_log_club_created_idx
  ON public.audit_log (club_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_admin_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_tenant_select" ON public.audit_log;

CREATE POLICY "audit_log_tenant_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.get_my_rol() = 'superadmin'
    OR (
      public.get_my_rol() = 'admin'
      AND club_id = public.get_my_club_id()
    )
  );

-- Una bitácora append-only no acepta filas construidas por el navegador.
-- Los triggers siguientes derivan actor, tenant y contenido desde la fila real.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;
REVOKE SELECT ON public.audit_log FROM anon;
GRANT SELECT ON public.audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.auditar_cambio_liga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_pago_id uuid;
  v_entidad_id uuid;
  v_club_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'liga_jugador_pagos' THEN
    v_pago_id := (v_fila ->> 'id')::uuid;
    v_entidad_id := v_pago_id;

    SELECT l.club_id INTO v_club_id
    FROM public.liga_divisiones d
    JOIN public.ligas l ON l.id = d.liga_id
    WHERE d.id = (v_fila ->> 'division_id')::uuid;
  ELSIF TG_TABLE_NAME = 'liga_abonos' THEN
    v_pago_id := (v_fila ->> 'pago_id')::uuid;
    v_entidad_id := (v_fila ->> 'id')::uuid;

    SELECT l.club_id INTO v_club_id
    FROM public.liga_jugador_pagos p
    JOIN public.liga_divisiones d ON d.id = p.division_id
    JOIN public.ligas l ON l.id = d.liga_id
    WHERE p.id = v_pago_id;
  ELSE
    RAISE EXCEPTION 'Tabla no soportada por auditar_cambio_liga: %', TG_TABLE_NAME;
  END IF;

  -- Al borrar un pago, el cascade puede eliminar sus abonos cuando el padre
  -- ya no es consultable. El cambio del pago padre conserva esa auditoría.
  IF v_club_id IS NULL AND TG_TABLE_NAME = 'liga_abonos' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el club del cambio auditado';
  END IF;

  INSERT INTO public.audit_log (
    club_id, entity_type, entity_id, action, before, after, user_id
  ) VALUES (
    v_club_id,
    TG_TABLE_NAME,
    v_entidad_id,
    lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_cambio_liga() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS liga_jugador_pagos_audit ON public.liga_jugador_pagos;
CREATE TRIGGER liga_jugador_pagos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.liga_jugador_pagos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_liga();

DROP TRIGGER IF EXISTS liga_abonos_audit ON public.liga_abonos;
CREATE TRIGGER liga_abonos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.liga_abonos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_liga();

-- ------------------------------------------------------------
-- 2. Reservas: ambos extremos deben ser del mismo tenant
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_reserva_mismo_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_clase uuid;
  v_club_jugador uuid;
BEGIN
  SELECT c.club_id INTO v_club_clase
  FROM public.clases c
  WHERE c.id = NEW.clase_id;

  SELECT j.club_id INTO v_club_jugador
  FROM public.jugadores j
  WHERE j.id = NEW.jugador_id;

  IF v_club_clase IS NULL OR v_club_jugador IS NULL THEN
    RAISE EXCEPTION 'Clase o jugador inexistente';
  END IF;

  IF v_club_clase IS DISTINCT FROM v_club_jugador THEN
    RAISE EXCEPTION 'La clase y el jugador deben pertenecer al mismo club';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_reserva_mismo_club() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reservas_mismo_club ON public.reservas;
CREATE TRIGGER reservas_mismo_club
  BEFORE INSERT OR UPDATE OF clase_id, jugador_id ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.validar_reserva_mismo_club();

DROP POLICY IF EXISTS "reservas_select" ON public.reservas;
CREATE POLICY "reservas_select" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    (
      jugador_id = public.get_my_jugador_id()
      OR public.get_my_rol() IN ('admin', 'profesor')
    )
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "reservas_admin_all" ON public.reservas;
CREATE POLICY "reservas_admin_all" ON public.reservas
  FOR ALL TO authenticated
  USING (
    public.get_my_rol() IN ('admin', 'profesor')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  )
  WITH CHECK (
    public.get_my_rol() IN ('admin', 'profesor')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "reservas_jugador_insert" ON public.reservas;
CREATE POLICY "reservas_jugador_insert" ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (
    jugador_id = public.get_my_jugador_id()
    AND estado IN ('confirmado', 'cancelado')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "reservas_jugador_update" ON public.reservas;
CREATE POLICY "reservas_jugador_update" ON public.reservas
  FOR UPDATE TO authenticated
  USING (
    jugador_id = public.get_my_jugador_id()
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  )
  WITH CHECK (
    jugador_id = public.get_my_jugador_id()
    AND estado IN ('confirmado', 'cancelado')
    AND EXISTS (
      SELECT 1 FROM public.jugadores j
      WHERE j.id = reservas.jugador_id
        AND j.club_id = public.get_my_club_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = reservas.clase_id
        AND c.club_id = public.get_my_club_id()
    )
  );

-- ------------------------------------------------------------
-- 3. Cierre defensivo de políticas y funciones privilegiadas
-- ------------------------------------------------------------
-- 038 ya hace este cierre. Se repite para instalaciones con historial desigual.
DROP POLICY IF EXISTS "solicitudes_insert_public" ON public.solicitudes_jugador;
REVOKE INSERT ON public.solicitudes_jugador FROM anon, authenticated;

-- Helpers usados por RLS: solo una sesión autenticada necesita ejecutarlos.
ALTER FUNCTION public.get_my_rol() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_club_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_jugador_id() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_my_rol() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_club_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_jugador_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_rol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_club_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_jugador_id() TO authenticated;

-- RPC administrativas: search_path fijo y sin ejecución anónima implícita.
ALTER FUNCTION public.dashboard_kpis(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.generar_mensualidades(uuid, int, int) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.dashboard_kpis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generar_mensualidades(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_mensualidades(uuid, int, int) TO authenticated;

-- Funciones trigger SECURITY DEFINER nunca deben invocarse directamente.
ALTER FUNCTION public.proteger_perfil() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.proteger_perfil() FROM PUBLIC, anon, authenticated;

-- RPC públicas: se conserva únicamente el grant explícito necesario.
ALTER FUNCTION public.validar_invitacion(text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.torneo_publico(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.solicitar_acceso_torneo(text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.solicitar_inscripcion_torneo(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.obtener_club_asistencia(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.registrar_asistencia_rut(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.validar_invitacion(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.torneo_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solicitar_acceso_torneo(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solicitar_inscripcion_torneo(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_club_asistencia(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_asistencia_rut(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.validar_invitacion(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.torneo_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_acceso_torneo(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_inscripcion_torneo(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_club_asistencia(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_rut(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text, uuid, text, text, text, text) TO anon, authenticated;

-- RPC autenticadas: sin acceso anónimo ni PUBLIC implícito.
ALTER FUNCTION public.registrar_asistencia_segura(uuid, date, time) SET search_path = public, pg_temp;
ALTER FUNCTION public.eliminar_asistencia_segura(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.cambiar_reserva_clase(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.contar_reservas_clases(uuid[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirmar_feedback_jugador(uuid) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.registrar_asistencia_segura(uuid, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eliminar_asistencia_segura(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_reserva_clase(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contar_reservas_clases(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_feedback_jugador(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_asistencia_segura(uuid, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_asistencia_segura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_reserva_clase(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contar_reservas_clases(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_feedback_jugador(uuid) TO authenticated;

-- Diagnóstico manual antes de validar `audit_log_club_id_present`:
-- SELECT * FROM public.audit_log WHERE club_id IS NULL;
-- Luego de clasificar esas filas:
-- ALTER TABLE public.audit_log VALIDATE CONSTRAINT audit_log_club_id_fkey;
-- ALTER TABLE public.audit_log VALIDATE CONSTRAINT audit_log_club_id_present;

COMMIT;
