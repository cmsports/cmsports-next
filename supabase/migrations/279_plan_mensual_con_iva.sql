-- ────────────────────────────────────────────────────────────
-- El plan mensual de un club no dice si el monto incluye IVA.
--
-- Un pago ya registra el neto aparte (`pagos_clubes.monto_neto`, migración
-- 256), pero el plan mensual del club —lo que define cuánto se le cobra cada
-- mes— sigue siendo un solo número sin ese desglose. Se agrega la misma
-- columna, opcional igual que en los pagos: si no se completa, el plan se
-- comporta exactamente igual que hoy.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('279_plan_mensual_con_iva');
SELECT _migracion_para_todos_los_clubes(
  'agrega una columna opcional a clubes, no toca ningún valor existente'
);

ALTER TABLE clubes ADD COLUMN IF NOT EXISTS plan_mensual_neto numeric;

COMMENT ON COLUMN clubes.plan_mensual_neto IS
  'El neto sin IVA del plan mensual, cuando se conoce el desglose. NULL = no se especificó (igual que antes de esta columna).';

COMMIT;
