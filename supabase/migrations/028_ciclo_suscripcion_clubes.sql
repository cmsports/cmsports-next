-- Ciclo comercial mensual administrado desde Super Admin.
ALTER TABLE clubes
  ADD COLUMN IF NOT EXISTS estado_plan text NOT NULL DEFAULT 'prueba',
  ADD COLUMN IF NOT EXISTS fecha_inicio_plan date,
  ADD COLUMN IF NOT EXISTS proximo_vencimiento date;

ALTER TABLE clubes DROP CONSTRAINT IF EXISTS clubes_estado_plan_check;
ALTER TABLE clubes ADD CONSTRAINT clubes_estado_plan_check
  CHECK (estado_plan IN ('prueba', 'activo', 'suspendido', 'cancelado'));

CREATE INDEX IF NOT EXISTS clubes_plan_vencimiento_idx
  ON clubes (estado_plan, proximo_vencimiento);

-- Los clubes existentes quedan en prueba hasta que el superadmin defina
-- explícitamente su fecha de inicio. Así no se generan cobros retroactivos.
UPDATE clubes
SET estado_plan = 'prueba', fecha_inicio_plan = NULL, proximo_vencimiento = NULL
WHERE fecha_inicio_plan IS NULL;
