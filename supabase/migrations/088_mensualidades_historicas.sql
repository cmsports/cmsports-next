-- Pasos 12 a 14: corregir mensualidades de meses pasados sin perder el rastro.
--
-- Hoy, una vez cerrado el mes, arreglar un pago mal cargado es complicado y no
-- queda registro de qué se cambió. Este módulo lo permite, pero con dos reglas
-- que vienen del pedido del club:
--
--   1. Cada modificación queda auditada: quién, cuándo, valor anterior y nuevo.
--   2. El impacto en la plata no pisa el movimiento original, sino que genera
--      un movimiento de ajuste. Así el libro sigue cuadrando y se puede
--      reconstruir cómo se llegó al número de hoy.
--
-- El ajuste se calcula como la diferencia entre lo que estaba registrado y lo
-- que queda: si un pago de $25.000 se corrige a $30.000, entra un ajuste de
-- $5.000, no un segundo ingreso de $30.000.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ══ 1. Auditoría ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auditoria_mensualidades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id      uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  mes             integer NOT NULL,
  anio            integer NOT NULL,
  estado_anterior text,
  estado_nuevo    text,
  monto_anterior  numeric,
  monto_nuevo     numeric,
  fecha_anterior  date,
  fecha_nueva     date,
  motivo          text,
  usuario_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auditoria_mens_jugador_idx ON auditoria_mensualidades (jugador_id, anio, mes);
CREATE INDEX IF NOT EXISTS auditoria_mens_fecha_idx   ON auditoria_mensualidades (creado_en DESC);

ALTER TABLE auditoria_mensualidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_mens_lectura" ON auditoria_mensualidades;
CREATE POLICY "auditoria_mens_lectura" ON auditoria_mensualidades
  FOR SELECT USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin'));


-- ══ 2. Una sola cuota por jugador y mes ═══════════════════════════════════
-- Sin esto, corregir un mes podría dejar dos filas y duplicar el ingreso.
DELETE FROM mensualidades a USING mensualidades b
WHERE a.jugador_id = b.jugador_id AND a.mes = b.mes AND a.anio = b.anio AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS mensualidades_jugador_periodo_uniq
  ON mensualidades (jugador_id, mes, anio);


-- ══ 3. Corregir un mes, con ajuste y auditoría ════════════════════════════
CREATE OR REPLACE FUNCTION public.corregir_mensualidad(
  p_jugador_id uuid,
  p_mes        integer,
  p_anio       integer,
  p_estado     text,              -- 'pagado' | 'pendiente' | 'sin_registro'
  p_monto      numeric DEFAULT NULL,
  p_fecha_pago date    DEFAULT NULL,
  p_metodo     text    DEFAULT NULL,
  p_motivo     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club      uuid;
  v_rol       text;
  v_nombre    text;
  v_jugador   text;
  v_id        uuid;
  v_estado_a  text;
  v_monto_a   numeric;
  v_fecha_a   date;
  v_aporte_a  numeric;   -- lo que el mes aportaba a la caja antes
  v_aporte_n  numeric;   -- lo que aporta después
  v_ajuste    numeric;
BEGIN
  SELECT p.club_id, p.rol, p.nombre INTO v_club, v_rol, v_nombre
  FROM perfiles p WHERE p.id = auth.uid();

  IF v_rol NOT IN ('admin', 'superadmin') THEN
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

  -- Solo lo cobrado cuenta para la caja: una cuota pendiente no es plata.
  v_aporte_a := CASE WHEN v_estado_a = 'pagado' THEN COALESCE(v_monto_a, 0) ELSE 0 END;
  v_aporte_n := CASE WHEN p_estado  = 'pagado' THEN COALESCE(p_monto, v_monto_a, 0) ELSE 0 END;
  v_ajuste   := v_aporte_n - v_aporte_a;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM mensualidades WHERE id = v_id;
  ELSIF v_id IS NULL THEN
    INSERT INTO mensualidades (club_id, jugador_id, mes, anio, monto, estado, fecha_pago, metodo)
    VALUES (v_club, p_jugador_id, p_mes, p_anio, p_monto, p_estado,
            CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, current_date) END, p_metodo)
    RETURNING id INTO v_id;
  ELSE
    UPDATE mensualidades SET
      estado     = p_estado,
      monto      = COALESCE(p_monto, monto),
      fecha_pago = CASE WHEN p_estado = 'pagado' THEN COALESCE(p_fecha_pago, fecha_pago, current_date) ELSE NULL END,
      metodo     = COALESCE(p_metodo, metodo)
    WHERE id = v_id;
  END IF;

  -- Nada que registrar si no cambió nada de fondo.
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

  -- El movimiento de ajuste. No se toca el original: se compensa la diferencia,
  -- que es lo que permite auditar después cómo se llegó al número de hoy.
  IF v_ajuste <> 0 THEN
    INSERT INTO movimientos
      (club_id, tipo, categoria, descripcion, monto, fecha, jugador_id,
       mes_correspondiente, anio_correspondiente, registrado_por, registrado_por_nombre, mensualidad_id)
    VALUES
      (v_club,
       CASE WHEN v_ajuste > 0 THEN 'ingreso' ELSE 'egreso' END,
       'ajuste_mensualidad',
       'Ajuste de mensualidad · ' || v_jugador || ' · ' ||
         to_char(make_date(p_anio, p_mes, 1), 'TMMonth YYYY') ||
         COALESCE(' · ' || p_motivo, ''),
       abs(v_ajuste),
       current_date, p_jugador_id, p_mes, p_anio, auth.uid(), v_nombre, v_id);
  END IF;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM mensualidades)                     AS mensualidades,
  (SELECT count(*) FROM auditoria_mensualidades)           AS auditorias,
  (SELECT count(*) FROM movimientos
    WHERE categoria = 'ajuste_mensualidad')                AS ajustes,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'corregir_mensualidad') AS funcion_creada;
