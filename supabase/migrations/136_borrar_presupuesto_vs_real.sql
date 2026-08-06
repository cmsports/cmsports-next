-- presupuesto_vs_real no la usa ninguna pantalla de la app hoy. Se descubrió
-- durante la auditoría de funciones privilegiadas (migración 134) — era una
-- de las que tenía el agujero de seguridad grave, pero al revisar quién la
-- llama en el código, no la llama nadie. Código muerto, se borra.
--
-- No se toca la tabla `presupuestos`: eso es dato, no código, y no lo pidió
-- nadie borrar.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('136_borrar_presupuesto_vs_real');

DROP FUNCTION IF EXISTS presupuesto_vs_real(uuid, integer, integer);

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT count(*) AS deberia_ser_cero
FROM pg_proc WHERE proname = 'presupuesto_vs_real';
