-- ────────────────────────────────────────────────────────────
-- `exento` también en los pagos de liga: retirarse deja de ser deuda eterna.
--
-- ── El problema ───────────────────────────────────────────────────────────
-- `retirarJugadorDeLiga` resuelve los partidos pendientes (walkover o
-- borrado) y marca la restricción para que no lo reprogramen. Lo que nunca
-- hace es tocar su cuota: `liga_jugador_pagos` queda en 'pendiente' para
-- siempre y el jugador sigue saliendo en el reporte de pagos de la liga.
--
-- Y no había forma de cerrarla: el CHECK solo aceptaba
-- ('pendiente','parcial','pagado'). No existe manera de decir "se retiró, no
-- se le cobra".
--
-- Es exactamente la situación que la migración 203 describe como el error a
-- evitar, con sus mismas palabras:
--
--   «Deudor eterno — la cuota nunca pasa a `pagado`, así que ensucia la tasa
--    de morosidad del dashboard y aparece siempre en la lista de deudores.»
--
-- Eso se arregló para `mensualidades` (203) y para `torneo_pagos` (192). Liga
-- quedó afuera, y por eso el mismo bug reapareció acá.
--
-- ── Qué hace esta migración ───────────────────────────────────────────────
-- Agrega 'exento' al CHECK. Nada más: no toca ninguna fila existente ni
-- cambia el significado de los otros tres estados. El código de la aplicación
-- es el que pasa a marcarlo al retirar a alguien.
--
-- Mismo nombre de estado que en mensualidades y torneos, a propósito: el
-- vocabulario del sistema tiene que ser uno solo. Ver 203.
--
-- ── Lo que NO hace ────────────────────────────────────────────────────────
-- No exime a nadie retroactivamente. Los que ya se retiraron antes de hoy
-- siguen en 'pendiente' hasta que alguien los cierre a mano desde la
-- pantalla: adivinar quién se retiró y quién simplemente no ha pagado es
-- justamente lo que no se puede hacer desde una migración.
--
-- No destructivo: solo cambia una restricción. Ejecutar a mano en SQL Editor.

BEGIN;
SELECT _migracion_nueva('211_liga_pago_exento');

ALTER TABLE public.liga_jugador_pagos
  DROP CONSTRAINT IF EXISTS liga_jugador_pagos_estado_check;

ALTER TABLE public.liga_jugador_pagos
  ADD CONSTRAINT liga_jugador_pagos_estado_check
  CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'exento'));

COMMENT ON COLUMN public.liga_jugador_pagos.estado IS
  'pendiente | parcial | pagado | exento. "exento" = se retiró de la liga y no se le cobra; sale de lo pendiente sin decir que pagó. Mismo estado y mismo significado que en mensualidades (203) y torneo_pagos (192).';

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) El CHECK tiene que aceptar los cuatro estados.
SELECT pg_get_constraintdef(oid) AS regla
FROM pg_constraint
WHERE conname = 'liga_jugador_pagos_estado_check';

-- 2) Cuántos arrastran deuda hoy, para saber a quién cerrar a mano.
--    Los que se retiraron figuran en liga_restricciones con motivo de retiro.
SELECT p.estado, count(*) AS cuantos
FROM public.liga_jugador_pagos p
GROUP BY p.estado
ORDER BY p.estado;
