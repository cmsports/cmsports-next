-- ────────────────────────────────────────────────────────────
-- Los ajustes negativos de mensualidad se guardaban con `tipo = 'egreso'`,
-- una palabra que Finanzas no conoce. El movimiento existe, se ve en la tabla
-- con signo menos, y NO entra en ningún total.
--
-- ── El defecto ────────────────────────────────────────────────────────────
-- `corregir_mensualidad` (versión viva: migración 116) cierra así:
--
--     INSERT INTO movimientos (club_id, tipo, ...)
--     VALUES (v_club,
--             CASE WHEN v_ajuste > 0 THEN 'ingreso' ELSE 'egreso' END,
--             'ajuste_mensualidad', ...)
--
-- Pero toda la aplicación conoce dos tipos, no tres:
--
--     // src/app/finanzas/page.tsx
--     const ingresos = movimientos.filter(m => m.tipo === 'ingreso')...
--     const gastos   = movimientos.filter(m => m.tipo === 'gasto')...
--
-- Y `movimientos.tipo` no tenía CHECK, así que el INSERT pasaba en silencio.
--
-- ── Qué significa en plata ────────────────────────────────────────────────
-- Pasar una mensualidad de "pagado $25.000" a "pendiente" —o bajarle el
-- monto— deja el ingreso original sumando y el ajuste compensatorio
-- invisible. El balance del mes queda inflado por esa diferencia.
--
-- Peor que invisible: la fila SÍ se dibuja en la tabla de movimientos, y como
-- la pantalla pinta `m.tipo === 'ingreso' ? '+' : '-'`, se muestra en rojo con
-- signo menos. Se ve descontada y no lo está.
--
-- El mismo `'egreso'` viene de la 088, se repitió en la 093 y sobrevivió en
-- la 116, que es la definición vigente.
--
-- ── Qué hace esta migración ───────────────────────────────────────────────
--   1. Respalda las filas afectadas (nombre único, sin IF NOT EXISTS, con RLS
--      cerrado — reglas de docs/migraciones-destructivas.md y lección de la
--      197/198, que descubrió un respaldo legible sin sesión).
--   2. Corrige `tipo = 'egreso'` → `'gasto'`.
--   3. Pone el CHECK que faltaba, para que no vuelva a entrar una tercera
--      palabra sin que nadie se entere.
--   4. Reemplaza la función con `'gasto'`.
--
-- ── OJO: esto cambia totales de meses ya cerrados ─────────────────────────
-- Es a propósito, y es la única forma de que los totales digan la verdad. Los
-- gastos de los meses con ajustes negativos van a SUBIR por el monto de esos
-- ajustes. La consulta de verificación del final imprime mes por mes cuánto
-- se movió, para poder avisarle al club antes de que lo note en un informe.
--
-- No se borra ni una fila.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('227_ajuste_mensualidad_es_gasto');

-- ══ 1. Preflight: ¿hay alguna OTRA palabra rara además de egreso? ══════════
-- Si aparece una tercera, el CHECK del paso 3 la rechazaría y abortaría todo.
-- Mejor caerse acá, con el nombre a la vista, que en un ALTER TABLE opaco.
DO $$
DECLARE v_raros text;
BEGIN
  SELECT string_agg(DISTINCT tipo, ', ')
    INTO v_raros
  FROM movimientos
  WHERE tipo NOT IN ('ingreso', 'gasto', 'egreso');

  IF v_raros IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay movimientos con tipos inesperados (%). Revisarlos a mano antes de poner el CHECK.',
      v_raros;
  END IF;
END $$;

-- ══ 2. Respaldo y conteo previo ════════════════════════════════════════════
-- El respaldo y la corrección salen de la MISMA condición, escrita una sola
-- vez, para que no puedan desalinearse.
CREATE TABLE _respaldo_movimientos_egreso_20260826 AS
SELECT * FROM movimientos WHERE tipo = 'egreso';

ALTER TABLE _respaldo_movimientos_egreso_20260826 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE _respaldo_movimientos_egreso_20260826 FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE _respaldo_movimientos_egreso_20260826 IS
  'Movimientos con tipo=egreso antes de la corrección de la migración 227. Solo lectura desde service role.';

DO $$
DECLARE v_filas integer; v_monto numeric;
BEGIN
  SELECT count(*), COALESCE(sum(monto), 0)
    INTO v_filas, v_monto
  FROM _respaldo_movimientos_egreso_20260826;

  RAISE NOTICE 'Movimientos con tipo=egreso a corregir: % filas, $% en total.', v_filas, v_monto;

  IF v_filas = 0 THEN
    RAISE NOTICE 'Ninguno. Igual se pone el CHECK y se corrige la función, que es lo que impide que vuelva.';
  END IF;
END $$;

-- ══ 3. Corregir las filas ya escritas ══════════════════════════════════════
UPDATE movimientos
SET tipo = 'gasto'
WHERE id IN (SELECT id FROM _respaldo_movimientos_egreso_20260826);

-- ══ 4. El CHECK que faltaba ════════════════════════════════════════════════
ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_tipo_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('ingreso', 'gasto'));

COMMENT ON CONSTRAINT movimientos_tipo_check ON movimientos IS
  'Finanzas suma solo estos dos. Una tercera palabra produce un movimiento invisible en los totales pero visible en la tabla (migración 227).';

-- ══ 5. La función, con 'gasto' ═════════════════════════════════════════════
-- Cuerpo idéntico al de la 116 salvo esa palabra. Va con `SET search_path`
-- declarado: CREATE OR REPLACE borra los SET de la versión anterior, que es
-- exactamente cómo estas cuatro funciones perdieron el suyo y la 210 tuvo que
-- volver a ponérselo.
CREATE OR REPLACE FUNCTION public.corregir_mensualidad(
  p_jugador_id uuid,
  p_mes        integer,
  p_anio       integer,
  p_estado     text,
  p_monto      numeric DEFAULT NULL,
  p_fecha_pago date    DEFAULT NULL,
  p_metodo     text    DEFAULT NULL,
  p_motivo     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club      uuid;
  v_rol       text;
  v_nombre    text;
  v_jugador   text;
  v_id        uuid;
  v_estado_a  text;
  v_monto_a   numeric;
  v_fecha_a   date;
  v_aporte_a  numeric;
  v_aporte_n  numeric;
  v_ajuste    numeric;
  v_hoy       date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT p.club_id, p.rol, p.nombre INTO v_club, v_rol, v_nombre
  FROM perfiles p WHERE p.id = auth.uid();

  -- El IS NULL va aparte: sin él, un perfil sin rol se salta el guardia.
  IF v_club IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el administrador puede corregir mensualidades';
  END IF;

  SELECT j.nombre INTO v_jugador FROM jugadores j
  WHERE j.id = p_jugador_id AND j.club_id = v_club;
  IF v_jugador IS NULL THEN RAISE EXCEPTION 'El jugador no es de este club'; END IF;

  IF p_mes NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes inválido: %', p_mes; END IF;
  IF p_estado NOT IN ('pagado', 'pendiente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT m.id, m.estado, m.monto, m.fecha_pago
    INTO v_id, v_estado_a, v_monto_a, v_fecha_a
  FROM mensualidades m
  WHERE m.jugador_id = p_jugador_id AND m.mes = p_mes AND m.anio = p_anio;

  v_aporte_a := CASE WHEN v_estado_a = 'pagado' THEN COALESCE(v_monto_a, 0) ELSE 0 END;
  v_aporte_n := CASE WHEN p_estado  = 'pagado' THEN COALESCE(p_monto, v_monto_a, 0) ELSE 0 END;
  v_ajuste   := v_aporte_n - v_aporte_a;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM mensualidades WHERE id = v_id;
  ELSIF v_id IS NULL THEN
    INSERT INTO mensualidades (club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo)
    VALUES (v_club, p_jugador_id, p_mes, p_anio, p_monto, p_estado,
            CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, v_hoy) END, p_metodo)
    RETURNING id INTO v_id;
  ELSE
    UPDATE mensualidades SET
      estado     = p_estado,
      monto      = COALESCE(p_monto, monto),
      fecha_pago = CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, fecha_pago, v_hoy) ELSE NULL END,
      metodo     = COALESCE(p_metodo, metodo)
    WHERE id = v_id;
  END IF;

  IF v_estado_a IS DISTINCT FROM NULLIF(p_estado, 'sin_registro')
     OR COALESCE(p_monto, v_monto_a) IS DISTINCT FROM v_monto_a
     OR (p_fecha_pago IS NOT NULL AND p_fecha_pago IS DISTINCT FROM v_fecha_a) THEN

    INSERT INTO auditoria_mensualidades
      (club_id, jugador_id, mes, anio, estado_anterior, estado_nuevo,
       monto_anterior, monto_nuevo, fecha_anterior, fecha_nueva, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_mes, p_anio, v_estado_a, NULLIF(p_estado, 'sin_registro'),
       v_monto_a, CASE WHEN p_estado = 'sin_registro' THEN NULL ELSE COALESCE(p_monto, v_monto_a) END,
       v_fecha_a, p_fecha_pago, p_motivo, auth.uid());
  END IF;

  IF v_ajuste <> 0 THEN
    INSERT INTO movimientos
      (club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
       mes_correspondiente, anio_correspondiente, registrado_por_nombre, mensualidad_id)
    VALUES
      (v_club,
       -- 'gasto', no 'egreso': Finanzas solo suma 'ingreso' y 'gasto', y el
       -- CHECK de arriba ya no deja pasar otra cosa (migración 227).
       CASE WHEN v_ajuste > 0 THEN 'ingreso' ELSE 'gasto' END,
       'ajuste_mensualidad',
       'Ajuste de mensualidad · ' || v_jugador || ' · ' ||
         to_char(make_date(p_anio, p_mes, 1), 'TMMonth YYYY') ||
         COALESCE(' · ' || p_motivo, ''),
       abs(v_ajuste),
       v_hoy, p_jugador_id, p_mes, p_anio, v_nombre, v_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_mensualidad(uuid, integer, integer, text, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corregir_mensualidad(uuid, integer, integer, text, numeric, date, text, text) TO authenticated;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) No debe quedar ningún 'egreso': cero filas.
SELECT tipo, count(*) FROM movimientos GROUP BY tipo ORDER BY tipo;

-- 2) La función ya no la escribe: false.
SELECT pg_get_functiondef(p.oid) LIKE '%''egreso''%' AS aun_escribe_egreso
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'corregir_mensualidad';

-- 3) QUÉ MESES CAMBIARON DE TOTAL. Esto es lo que hay que avisarle al club:
--    son gastos que antes no aparecían en ningún informe.
SELECT c.nombre AS club,
       to_char(r.fecha, 'YYYY-MM') AS mes,
       count(*)      AS ajustes_recuperados,
       sum(r.monto)  AS gasto_que_ahora_suma
FROM _respaldo_movimientos_egreso_20260826 r
JOIN clubes c ON c.id = r.club_id
GROUP BY c.nombre, to_char(r.fecha, 'YYYY-MM')
ORDER BY c.nombre, mes;

-- 4) El respaldo no se puede leer sin la llave de servicio: cero políticas y
--    RLS activo.
SELECT c.relrowsecurity AS rls_activo,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_respaldo_movimientos_egreso_20260826';
