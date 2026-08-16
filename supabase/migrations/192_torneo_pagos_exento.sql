-- Agrega el estado 'exento' a torneo_pagos: para el jugador que se retiró de
-- un torneo y no hay que cobrarle la inscripción. No se puede simplemente
-- borrar su fila de torneo_pagos ni sacarlo del grupo/bracket si ya jugó
-- partidos (quitarJugadorDeGrupo lo bloquea), así que la salida es un tercer
-- estado de pago, no una eliminación.
--
-- torneo_pagos se creó desde el dashboard, no por migración, así que su CHECK
-- de `estado` no está en ningún archivo del repo. Se verificó en producción:
-- hoy solo hay filas 'pendiente' y 'pagado' (52 filas), así que agregar
-- 'exento' al CHECK no choca con nada existente.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('192_torneo_pagos_exento');

ALTER TABLE public.torneo_pagos DROP CONSTRAINT IF EXISTS torneo_pagos_estado_check;
ALTER TABLE public.torneo_pagos ADD CONSTRAINT torneo_pagos_estado_check
  CHECK (estado = ANY (ARRAY['pendiente', 'pagado', 'exento']));

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.torneo_pagos'::regclass AND conname = 'torneo_pagos_estado_check';
