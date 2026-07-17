-- ============================================================
-- CmSports — validación final de constraints de 041 y 042
-- Ejecutar solo si preflight_043_integridad_postdespliegue retorna 0 en todo.
-- No elimina ni modifica filas.
-- ============================================================

BEGIN;

ALTER TABLE public.audit_log
  VALIDATE CONSTRAINT audit_log_club_id_fkey;

ALTER TABLE public.audit_log
  VALIDATE CONSTRAINT audit_log_club_id_present;

ALTER TABLE public.solicitudes_jugador
  VALIDATE CONSTRAINT solicitudes_jugador_torneo_id_fkey;

COMMIT;
