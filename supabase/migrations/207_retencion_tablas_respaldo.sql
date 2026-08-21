-- ────────────────────────────────────────────────────────────
-- Política de retención para las tablas `_respaldo_*`.
--
-- Cada `_respaldo_*` es una foto vieja de datos reales —jugadores, montos,
-- RUTs— tomada antes de una migración destructiva o una limpieza puntual.
-- La 197 les puso RLS deny-all, así que hoy nadie las lee por la API. Pero
-- ninguna tiene fecha de vencimiento: quedan ahí para siempre, y eso no es
-- defendible bajo la ley de protección de datos que entra en vigor el
-- 1 de diciembre de 2026 (un respaldo no es un fin de tratamiento indefinido).
--
-- Esta migración NO borra nada todavía. Crea la política —una tabla que
-- dice hasta cuándo se conserva cada respaldo y por qué— y una función que
-- solo REPORTA cuáles ya vencieron. El borrado en sí se hace después, a
-- mano, con `SELECT purgar_respaldo_vencido('nombre_de_la_tabla')`, para
-- mantener la misma disciplina que el resto del proyecto: nada destructivo
-- corre solo.
--
-- Plazo general: 90 días desde que se generó el respaldo.
--
-- Excepción: `_respaldo_asistencia_089`, `_respaldo_mensualidades_089` y
-- `_respaldo_movimientos_089` NO tienen fecha de vencimiento. Son la
-- evidencia del incidente real del 2026-08-05: `089_arranque_limpio_buin`
-- se ejecutó dos veces y borró 161 movimientos de mensualidad, un ingreso de
-- $3.191.300 y dos sueldos (ver docs/migraciones-destructivas.md). Se
-- recuperó solo porque `audit_log` guardaba el monto de cada movimiento.
-- Estos tres respaldos son la prueba de eso y quedan fuera de la purga
-- automática para siempre. Si algún día hay que borrarlos, se hace a
-- conciencia, igual que una fila de `_migraciones_aplicadas`.
--
-- CONVENCIÓN PARA MIGRACIONES FUTURAS: toda migración que cree una tabla
-- `_respaldo_*` nueva debe insertar su fila acá mismo, en la misma
-- transacción. Si no se registra, `_respaldos_vencidos()` no la va a ver
-- nunca y quedará viva para siempre igual que las de antes de esta política.
--
-- No destructivo. Ejecutar a mano en SQL Editor de Supabase.

BEGIN;
SELECT _migracion_nueva('207_retencion_tablas_respaldo');

CREATE TABLE IF NOT EXISTS _respaldo_politica_retencion (
  tabla         text PRIMARY KEY,
  retener_hasta date,
  motivo        text NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE _respaldo_politica_retencion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE _respaldo_politica_retencion FROM anon, authenticated;

COMMENT ON TABLE _respaldo_politica_retencion IS
  'Hasta cuándo se conserva cada tabla _respaldo_*. retener_hasta NULL = conservación indefinida a conciencia (ver motivo). Ver docs/migraciones-destructivas.md.';

-- ══ Los respaldos que existen hoy ═══════════════════════════════════════════

-- Evidencia del incidente real de julio. Conservación indefinida.
INSERT INTO _respaldo_politica_retencion (tabla, retener_hasta, motivo) VALUES
  ('_respaldo_asistencia_089',    NULL, 'Evidencia del incidente 089 (2026-08-05): la 089 se corrió dos veces y borró datos reales. Conservar indefinidamente junto con los otros dos respaldos de la misma migración.'),
  ('_respaldo_mensualidades_089', NULL, 'Evidencia del incidente 089 (2026-08-05): 104 filas de mensualidades reales al momento del borrado. Conservar indefinidamente.'),
  ('_respaldo_movimientos_089',   NULL, 'Evidencia del incidente 089 (2026-08-05): 45 filas de movimientos reales, incluye el ingreso de $3.191.300 y los dos sueldos recuperados. Conservar indefinidamente.')
ON CONFLICT (tabla) DO NOTHING;

-- Respaldo de la 083, previa al registro de migraciones (nació en la 128), así
-- que no hay fecha real de creación que rescatar. El reloj arranca hoy: es
-- más seguro partir de la fecha conocida que adivinar una anterior.
INSERT INTO _respaldo_politica_retencion (tabla, retener_hasta, motivo) VALUES
  ('_respaldo_dias_sede_083', (now() AT TIME ZONE 'America/Santiago')::date + 90,
   'Respaldo de la 083 (previa al registro de migraciones). Sin fecha de creación real registrada; el plazo de 90 días arranca el día en que se creó esta política, no el día real del respaldo.')
ON CONFLICT (tabla) DO NOTHING;

-- Respaldos puntuales del 2026-08-09, con la fecha en el propio nombre.
INSERT INTO _respaldo_politica_retencion (tabla, retener_hasta, motivo) VALUES
  ('_respaldo_cuentas_fantasma_20260809',       date '2026-08-09' + 90, 'Respaldo puntual antes de 141_borrar_cuentas_fantasma_buin. Retención estándar de 90 días desde la fecha en el nombre de la tabla.'),
  ('_respaldo_externos_spinhouse_151_20260809', date '2026-08-09' + 90, 'Respaldo puntual antes de 151_limpiar_externos_spinhouse. Retención estándar de 90 días.'),
  ('_respaldo_ranking_general_20260809',        date '2026-08-09' + 90, 'Respaldo puntual antes de 140_borrar_ranking_general. Retención estándar de 90 días.')
ON CONFLICT (tabla) DO NOTHING;

-- ══ Reporte: qué respaldos ya vencieron ══════════════════════════════════════
-- Solo lee. No borra nada. Correr esto cada tanto para saber qué está listo
-- para purgar.
CREATE OR REPLACE FUNCTION _respaldos_vencidos()
RETURNS TABLE(tabla text, retener_hasta date, dias_vencido integer, motivo text, tamano text, filas bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.tabla,
         r.retener_hasta,
         ((now() AT TIME ZONE 'America/Santiago')::date - r.retener_hasta)::integer,
         r.motivo,
         pg_size_pretty(pg_total_relation_size(c.oid)),
         COALESCE(s.n_live_tup, 0)
  FROM _respaldo_politica_retencion r
  JOIN pg_class c ON c.relname = r.tabla
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE r.retener_hasta IS NOT NULL
    AND r.retener_hasta < (now() AT TIME ZONE 'America/Santiago')::date
  ORDER BY r.retener_hasta;
$$;

REVOKE ALL ON FUNCTION _respaldos_vencidos() FROM PUBLIC, anon, authenticated;

-- ══ Purga: borra UNA tabla, y solo si la política lo permite hoy ════════════
-- No hay purga automática ni cron. Se llama a mano, tabla por tabla, después
-- de revisar `_respaldos_vencidos()`. Si la tabla no está en la política, no
-- venció, o quedó marcada de conservación indefinida, no hace nada y avisa
-- por qué.
CREATE OR REPLACE FUNCTION purgar_respaldo_vencido(p_tabla text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_retener_hasta date;
BEGIN
  IF p_tabla !~ '^_respaldo_' THEN
    RETURN 'Rechazado: "' || p_tabla || '" no empieza con _respaldo_, no se toca.';
  END IF;

  SELECT retener_hasta INTO v_retener_hasta
  FROM _respaldo_politica_retencion WHERE tabla = p_tabla;

  IF NOT FOUND THEN
    RETURN 'Rechazado: "' || p_tabla || '" no está en _respaldo_politica_retencion. Agregala primero a conciencia.';
  END IF;

  IF v_retener_hasta IS NULL THEN
    RETURN 'Rechazado: "' || p_tabla || '" tiene conservación indefinida. Para borrarla hay que cambiar su fila en _respaldo_politica_retencion a mano primero.';
  END IF;

  IF v_retener_hasta >= (now() AT TIME ZONE 'America/Santiago')::date THEN
    RETURN 'Rechazado: "' || p_tabla || '" vence recién el ' || v_retener_hasta || '.';
  END IF;

  EXECUTE format('DROP TABLE IF EXISTS %I', p_tabla);
  DELETE FROM _respaldo_politica_retencion WHERE tabla = p_tabla;

  RETURN 'Purgada: "' || p_tabla || '".';
END;
$$;

REVOKE ALL ON FUNCTION purgar_respaldo_vencido(text) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verificación: correr aparte, no como parte del script de arriba ────────
-- SELECT * FROM _respaldos_vencidos();
