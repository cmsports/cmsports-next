-- CmSports — permite subir pagos de torneo a Finanzas en lotes parciales
-- (algunos jugadores pagan altiro, otros hasta una semana después).
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

ALTER TABLE public.torneo_pagos
  ADD COLUMN IF NOT EXISTS subido_a_finanzas boolean NOT NULL DEFAULT false;

-- Backfill: torneos que ya se enviaron a Finanzas antes de este cambio
-- (en bloque, vía "Registrar en Finanzas" o "Guardar premios") no deben
-- poder volver a subirse — se marcan sus pagos ya registrados como subidos.
UPDATE public.torneo_pagos tp
SET subido_a_finanzas = true
FROM public.torneos t
WHERE tp.torneo_id = t.id
  AND t.contabilidad_enviada = true
  AND tp.estado = 'pagado';

COMMIT;
