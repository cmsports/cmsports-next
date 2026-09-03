-- ────────────────────────────────────────────────────────────
-- Neto e IVA en un pago, cuando viene desglosado.
--
-- Este cambio afecta a: CmSports (empresa), no a un club. Sigue de la 255,
-- que ya se corrió en producción: agrega una columna a `pagos_clubes`, no
-- toca filas de nadie.
--
-- Buin pagó $60.000 en septiembre: $50.000 + IVA, distinto de los pagos
-- anteriores, que llegaban sin desglosar. `monto` sigue siendo lo que
-- efectivamente entró a la cuenta; `monto_neto` es opcional y nace NULL, así
-- que todo pago existente sigue mostrándose exactamente igual que antes. El
-- IVA no se guarda aparte —es `monto - monto_neto`— porque guardarlo por
-- separado sería el mismo dato dos veces y una forma más de que se
-- desincronicen.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('256_pagos_clubes_monto_neto');
SELECT _migracion_para_todos_los_clubes(
  'agrega una columna opcional a pagos_clubes (finanzas de CmSports), no toca filas de ningún club'
);

ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS monto_neto numeric;

ALTER TABLE pagos_clubes DROP CONSTRAINT IF EXISTS pagos_clubes_monto_neto_check;
ALTER TABLE pagos_clubes ADD CONSTRAINT pagos_clubes_monto_neto_check
  CHECK (monto_neto IS NULL OR (monto_neto > 0 AND monto_neto <= monto));

COMMIT;
