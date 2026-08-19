-- Recupera dos pagos de mensualidad de julio 2026 que quedaron sin su ingreso
-- en Finanzas. Los encontró el diagnóstico de salud
-- (docs/pegar-diagnostico-salud.sql) el 2026-08-18.
--
-- ── Qué pasó ──────────────────────────────────────────────────────────────
-- Las dos mensualidades figuran `pagado`, con fecha y método, pero su fila en
-- `movimientos` no existe. El `audit_log` guarda el rastro completo del pago,
-- incluido el id del movimiento que se creó en su momento:
--
--   Juan pablo Parra Gonzalez     $26.250  transferencia  2026-07-28 00:59
--     movimiento b52e98e1-6ea6-45ad-a4a5-9938d02ad776  -> ya no existe
--   Juan Carlos González Alarcón  $12.500  transferencia  2026-07-28 01:11
--     movimiento 86033610-03f3-4ad5-8a1a-380502875e51  -> ya no existe
--
-- Fechas de julio 2026 y movimientos de mensualidad destruidos: es el mismo
-- cuadro que dejó `089_arranque_limpio_buin.sql` al ejecutarse dos veces. La
-- recuperación de agosto rescató 161 movimientos, pero estos dos no estaban en
-- `_respaldo_movimientos_089` —se verificó, no aparecen— así que quedaron
-- fuera y nadie los echó de menos hasta ahora.
--
-- Es exactamente el escenario que el CLAUDE.md describe: se pudo reconstruir
-- "solo porque audit_log guardaba el monto de cada movimiento al crearlo".
--
-- ── Qué hace esta migración ───────────────────────────────────────────────
-- Recrea los dos movimientos con SU ID ORIGINAL, tomando los datos del propio
-- audit_log. Usar el id de entonces importa: deja la cadena
-- mensualidad -> movimiento igual que antes del desastre, y hace que esto sea
-- idempotente de verdad (si se corriera dos veces, el segundo intento choca
-- con la clave primaria en vez de duplicar plata).
--
-- Los montos NO se escriben a mano: salen de `audit_log.after`, que es la
-- fuente que sobrevivió. Escribirlos a dedo sería inventar.
--
-- No toca las mensualidades: ya están correctas en `pagado`. Lo único que
-- faltaba era el ingreso en el libro.
--
-- ── Alcance ───────────────────────────────────────────────────────────────
-- Solo estos dos casos, y solo de Asociación TDM Buin y Paine. El diagnóstico
-- reportó 94 movimientos sin mensualidad_id y 19 mensualidades sin movimiento,
-- pero se revisaron uno por uno: el resto son datos sembrados de Club
-- Demostración y San Bernardo, más tres de Buin marcados "Seed demo
-- presentación". Ninguno es plata real.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('201_recuperar_dos_pagos_julio');

DO $$
DECLARE
  r          record;
  v_club     uuid;
  v_jugador  uuid;
  v_nombre   text;
  v_mes      int;
  v_anio     int;
  n_creados  int := 0;
BEGIN
  FOR r IN
    SELECT a.entity_id AS mensualidad_id,
           (a.after ->> 'movimiento_id')::uuid AS movimiento_id,
           (a.after ->> 'monto')::int          AS monto,
            a.after ->> 'metodo'               AS metodo,
            a.created_at
    FROM public.audit_log a
    WHERE a.entity_type = 'mensualidades'
      AND a.action = 'pagar'
      AND a.entity_id IN (
        '7810bd14-08d3-4b4a-bf54-ef409f61244e',
        'b7b9b80e-a54c-4de3-a25b-9728e88c7e4f'
      )
  LOOP
    -- Si el movimiento ya existe, no hay nada que recuperar.
    IF EXISTS (SELECT 1 FROM public.movimientos WHERE id = r.movimiento_id) THEN
      RAISE NOTICE 'ya existe, se salta: %', r.movimiento_id;
      CONTINUE;
    END IF;

    SELECT m.club_id, m.jugador_id, m.mes, m.anio
      INTO v_club, v_jugador, v_mes, v_anio
    FROM public.mensualidades m
    WHERE m.id = r.mensualidad_id;

    IF v_club IS NULL THEN
      RAISE EXCEPTION 'No se encontro la mensualidad %', r.mensualidad_id;
    END IF;

    SELECT j.nombre INTO v_nombre FROM public.jugadores j WHERE j.id = v_jugador;

    INSERT INTO public.movimientos (
      id, club_id, tipo, categoria, descripcion, monto, fecha,
      jugador_id, mes_correspondiente, anio_correspondiente,
      registrado_por_nombre, mensualidad_id
    ) VALUES (
      r.movimiento_id,
      v_club,
      'ingreso',
      'mensualidad',
      'Mensualidad ' || v_mes || '/' || v_anio || ' — ' || coalesce(v_nombre, 'jugador') ||
        ' (recuperado del audit_log, migracion 201)',
      r.monto,
      (r.created_at AT TIME ZONE 'America/Santiago')::date,
      v_jugador,
      v_mes,
      v_anio,
      'Recuperacion 201',
      r.mensualidad_id
    );

    n_creados := n_creados + 1;
    RAISE NOTICE 'recuperado: % por $%', coalesce(v_nombre,'?'), r.monto;
  END LOOP;

  RAISE NOTICE 'Movimientos recuperados: %', n_creados;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las dos mensualidades ya no deben aparecer huérfanas: cero filas.
SELECT m.id, m.mes, m.anio, m.monto
FROM public.mensualidades m
WHERE m.id IN ('7810bd14-08d3-4b4a-bf54-ef409f61244e',
               'b7b9b80e-a54c-4de3-a25b-9728e88c7e4f')
  AND NOT EXISTS (SELECT 1 FROM public.movimientos mo WHERE mo.mensualidad_id = m.id);

-- 2) Los dos movimientos recuperados, para verlos.
SELECT id, fecha, descripcion, monto, registrado_por_nombre
FROM public.movimientos
WHERE id IN ('b52e98e1-6ea6-45ad-a4a5-9938d02ad776',
             '86033610-03f3-4ad5-8a1a-380502875e51')
ORDER BY fecha;
