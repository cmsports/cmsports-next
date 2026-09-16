-- ────────────────────────────────────────────────────────────
-- Ingresos que no vienen de un club.
--
-- Hasta ahora `pagos_clubes` asumía que toda plata que entra viene de un
-- club (`club_id not null`). En la práctica también entra plata de otros
-- lados —un reembolso, un aporte, algo que no es la mensualidad de nadie—
-- y no había dónde ponerla sin inventarle un club falso.
--
-- Se relaja `club_id` a nullable y se agrega `categoria` (texto libre, igual
-- que `gastos_cmsports.categoria`): cuando no hay club, categoria cuenta de
-- dónde vino. El check evita la fila huérfana —ni club ni categoria—, que
-- sería un ingreso sin ningún rastro de su origen.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('278_ingresos_otras_fuentes');
SELECT _migracion_para_todos_los_clubes(
  'cambia el esquema de pagos_clubes, no toca filas de ningún club'
);

ALTER TABLE pagos_clubes ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE pagos_clubes ADD COLUMN IF NOT EXISTS categoria text;

ALTER TABLE pagos_clubes DROP CONSTRAINT IF EXISTS pagos_clubes_origen_check;
ALTER TABLE pagos_clubes ADD CONSTRAINT pagos_clubes_origen_check
  CHECK (club_id IS NOT NULL OR categoria IS NOT NULL);

COMMENT ON COLUMN pagos_clubes.categoria IS
  'Solo cuando club_id es null: de dónde vino la plata (reembolso, aporte, etc).';

COMMIT;
