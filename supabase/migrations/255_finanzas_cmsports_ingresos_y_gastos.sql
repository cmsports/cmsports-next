-- ────────────────────────────────────────────────────────────
-- Las finanzas de CmSports: historial completo de ingresos, y gastos.
--
-- Este cambio afecta a: **CmSports**, no a un club. Son las cuentas de la
-- empresa —lo que cada club le paga y lo que la empresa gasta—, no la plata de
-- ningún club. No toca una sola fila de ningún club: agrega dos columnas a
-- `pagos_clubes` y crea una tabla nueva.
--
-- ══ Qué problema resuelve ═════════════════════════════════════════════════
--
-- La pantalla /superadmin/finanzas hoy muestra "cobrado este mes" y los diez
-- últimos pagos. Con eso no se puede responder ninguna de las tres preguntas
-- que se hacen de verdad:
--
--   1. ¿Cuánto nos ha pagado Buin en total, desde que partimos?
--      El acumulado no existe en ninguna parte. Se ve el mes corriente y nada
--      más, así que dos pagos del mismo club en meses distintos se ven igual
--      que uno solo.
--
--   2. ¿Dónde está la factura de ese pago?
--      En el correo de alguien. No hay dónde guardarla.
--
--   3. ¿Cuánto gastamos?
--      No hay tabla de gastos. La pantalla se llama "Finanzas" y solo sabe
--      sumar ingresos, así que el número que muestra no es un resultado: es
--      la mitad de uno.
--
-- ══ `concepto`: por qué una columna y no otra tabla ═══════════════════════
--
-- No todo lo que un club paga es la mensualidad. Buin pagó $80.000 una vez por
-- la implementación, que es un cobro que ocurre UNA vez y no corre la fecha de
-- vencimiento del plan. Registrarlo como mensualidad haría dos daños: correría
-- el próximo vencimiento un mes de regalo, e inflaría el promedio mensual.
--
-- Es el mismo hecho —plata que entró de un club, en una fecha, con su factura—
-- así que va en la misma tabla con una etiqueta, no en una tabla paralela que
-- después haya que unir en cada consulta. El default es 'mensualidad', que es
-- lo que son todas las filas que ya existen.
--
-- ══ Las facturas van al bucket privado, fuera del alcance de los clubes ═══
--
-- Se guarda la RUTA dentro del bucket `privado` (migración 072), no una URL:
-- los enlaces se firman al momento de descargar y vencen solos.
--
-- La ruta es `facturas-cmsports/...`, y esa primera carpeta importa. Las dos
-- políticas del bucket comparan `(storage.foldername(name))[2]` contra el
-- `club_id` del que mira; para estas rutas esa posición es 'pagos' o 'gastos',
-- que no es el UUID de nadie. O sea: ninguna política calza, y los archivos
-- solo se alcanzan con la service key desde una Server Action que ya verificó
-- que quien pide es superadmin. Un admin de club no llega ni teniendo el
-- enlace. Son facturas de la empresa: no son suyas.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('255_finanzas_cmsports_ingresos_y_gastos');
SELECT _migracion_para_todos_los_clubes(
  'son las finanzas de CmSports (empresa), no las de un club: agrega columnas y una tabla, no toca filas de nadie'
);


-- ══ 1. Los pagos que ya se registran, con concepto y factura ══════════════

ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS concepto       text NOT NULL DEFAULT 'mensualidad';
ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS factura_path   text;
ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS factura_nombre text;

-- Neto, opcional. Nace NULL: los pagos que ya existen no llevaban IVA
-- desglosado y siguen sin mostrarlo. El IVA no se guarda aparte —es
-- `monto - monto_neto`— porque guardarlo por separado es el mismo dato dos
-- veces y una forma más de que se desincronicen.
ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS monto_neto numeric;

ALTER TABLE pagos_clubes DROP CONSTRAINT IF EXISTS pagos_clubes_monto_neto_check;
ALTER TABLE pagos_clubes ADD CONSTRAINT pagos_clubes_monto_neto_check
  CHECK (monto_neto IS NULL OR (monto_neto > 0 AND monto_neto <= monto));

ALTER TABLE pagos_clubes DROP CONSTRAINT IF EXISTS pagos_clubes_concepto_check;
ALTER TABLE pagos_clubes ADD CONSTRAINT pagos_clubes_concepto_check
  CHECK (concepto IN ('mensualidad', 'implementacion', 'soporte', 'otro'));

COMMENT ON COLUMN pagos_clubes.concepto IS
  'Qué se pagó. Solo ''mensualidad'' corre el próximo vencimiento del plan; los demás son cobros de una vez.';

-- El histórico por club se consulta por club y se ordena por fecha. Con cuatro
-- clubes da lo mismo, pero el índice cuesta nada y la consulta es la de todas
-- las pantallas nuevas.
CREATE INDEX IF NOT EXISTS pagos_clubes_club_fecha_idx
  ON pagos_clubes (club_id, fecha_pago DESC);


-- ══ 2. Los gastos de CmSports ═════════════════════════════════════════════
--
-- `categoria` es texto libre a propósito, sin lista cerrada. Los gastos de una
-- empresa chica no se dejan encasillar de antemano (hosting, dominio, un
-- notario, una impresión) y una lista cerrada obliga a una migración cada vez
-- que aparece un gasto nuevo. La pantalla ofrece las de siempre en un
-- `datalist`, que da la comodidad sin cerrar la puerta.
--
-- No hay `club_id`: un gasto de CmSports no pertenece a ningún club. Por eso
-- tampoco entra en `TABLAS_BORRAR_POR_CLUB` de `actions/superadmin.ts`: borrar
-- un club no puede borrar el gasto de un servidor que se pagó igual.

CREATE TABLE IF NOT EXISTS gastos_cmsports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha          date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  monto          numeric NOT NULL CHECK (monto > 0),
  categoria      text NOT NULL,
  descripcion    text NOT NULL,
  proveedor      text,
  factura_path   text,
  factura_nombre text,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gastos_cmsports_fecha_idx ON gastos_cmsports (fecha DESC);

COMMENT ON TABLE gastos_cmsports IS
  'Gastos de la empresa CmSports. No confundir con `movimientos`, que es la plata de cada club.';

ALTER TABLE gastos_cmsports ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que `pagos_clubes` (migración 006): esto lo ve y lo escribe
-- solo el superadmin. Sin política para nadie más, así que un admin de club
-- que consulte la tabla recibe cero filas.
DROP POLICY IF EXISTS "gastos_cmsports_superadmin_all" ON gastos_cmsports;
CREATE POLICY "gastos_cmsports_superadmin_all" ON gastos_cmsports
  FOR ALL USING (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');

COMMIT;


-- ════════════════════════════════════════════════════════════
-- Después de correr esto
-- ════════════════════════════════════════════════════════════
-- Los pagos que faltan se registran desde la pantalla
-- (/superadmin/finanzas → "Registrar pago"), que ahora pide fecha y concepto:
-- así quedan con su fecha real y con la factura adjunta, en vez de escribirlos
-- acá a mano sin respaldo.
