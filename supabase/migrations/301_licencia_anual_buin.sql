-- La licencia anual del jugador: si la pagó, cuánto, y su ingreso en Finanzas.
--
-- SOLO Asociación TDM Buin y Paine. Crea una tabla vacía, dos RPC y enciende
-- el módulo 'licencia_anual' en Buin. No cambia ninguna fila de jugadores,
-- movimientos ni de otro club.
--
-- ── Qué se paga ───────────────────────────────────────────────────────────
-- Buin cobra en octubre la licencia del año siguiente. La ficha muestra un
-- botón "Pago confirmado licencia 2027"; al apretarlo pregunta el monto y lo
-- registra en Finanzas como "Pago licencia año 2027 — <jugador>".
--
-- ── Qué año se cobra ──────────────────────────────────────────────────────
-- Lo decide el admin desde Configuración, en la clave `licencia.anio` de
-- `club_config`. No se calcula de la fecha: el club empieza a cobrar el año
-- siguiente cuando quiere, y en enero puede seguir cobrando la del año en
-- curso a quien pagó tarde. Sin la fila, 2027 — que es el mismo default del
-- catálogo `src/lib/domain/clubConfig.ts` (`licenciaAnual.test.ts` cruza los
-- dos números).
--
-- ── Por qué una tabla y no una columna en `jugadores` ─────────────────────
-- Una columna `licencia_pagada` habría que borrarla a mano cada año, y eso es
-- un UPDATE masivo sobre la tabla de jugadores pegado en el SQL Editor. Con
-- una fila por jugador y año, cuando el admin pasa a 2028 nadie aparece como
-- pagado y la de 2027 queda guardada tal cual: el botón "se libera solo".
--
-- ── Por qué un RPC ────────────────────────────────────────────────────────
-- Marcar la licencia y registrar su ingreso ocurren juntos o no ocurren, igual
-- que la matrícula (138). La categoría 'licencia' la escribe solo este RPC,
-- como 'clase_extraordinaria' (099): no entra a la lista blanca de
-- `registrar_movimiento_financiero_atomico`, así que esa función —que en la
-- base puede ir más adelante que en el repo— no se toca.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('301_licencia_anual_buin');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');


-- ══ 1. La tabla ═══════════════════════════════════════════════════════════
CREATE TABLE public.licencias_pagadas (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid        NOT NULL REFERENCES public.clubes(id),
  -- Borrar al jugador borra su marca de licencia, pero NO el ingreso: el
  -- movimiento queda con jugador_id NULL por `eliminar_jugador_atomico` (127).
  jugador_id            uuid        NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  anio                  integer     NOT NULL CHECK (anio BETWEEN 2026 AND 2100),
  -- 0 = confirmada sin cobro (el club la eximió). >0 = tiene su movimiento.
  monto                 integer     NOT NULL CHECK (monto >= 0),
  fecha                 date        NOT NULL,
  movimiento_id         uuid        REFERENCES public.movimientos(id) ON DELETE SET NULL,
  registrado_por_nombre text,
  creado_en             timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (jugador_id, anio)
);
CREATE INDEX licencias_pagadas_club_anio ON public.licencias_pagadas (club_id, anio);

ALTER TABLE public.licencias_pagadas ENABLE ROW LEVEL SECURITY;

-- La lee el staff del club: el profesor de Buin ve la plata del alumno
-- (`profe.ve_mensualidad` = 'si'), y la pantalla esconde el monto cuando no.
CREATE POLICY licencias_pagadas_staff_lee ON public.licencias_pagadas
FOR SELECT TO authenticated USING (
  club_id = public.get_my_club_id()
  AND public.get_my_rol() IN ('admin', 'superadmin', 'profesor')
);
-- Las escrituras van solo por los RPC de abajo.
GRANT SELECT ON public.licencias_pagadas TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.licencias_pagadas FROM anon, authenticated;

-- Sin esto la ficha y el filtro de Jugadores se suscriben, no reciben nada
-- nunca y muestran lo viejo (CLAUDE.md, migraciones 121 y 142).
ALTER PUBLICATION supabase_realtime ADD TABLE public.licencias_pagadas;


-- ══ 2. El año que se está cobrando ════════════════════════════════════════
-- Misma regla que `normalizarValor` en TS: entero dentro de rango o el
-- default. Un valor mal escrito en club_config no puede colar un año raro.
CREATE FUNCTION public._licencia_anio_cobro(p_club_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor jsonb;
  v_num numeric;
BEGIN
  SELECT valor INTO v_valor FROM public.club_config
  WHERE club_id = p_club_id AND clave = 'licencia.anio';

  IF v_valor IS NULL OR jsonb_typeof(v_valor) <> 'number' THEN RETURN 2027; END IF;
  v_num := (v_valor #>> '{}')::numeric;
  IF v_num <> trunc(v_num) OR v_num < 2026 OR v_num > 2100 THEN RETURN 2027; END IF;
  RETURN v_num::integer;
END;
$$;
REVOKE ALL ON FUNCTION public._licencia_anio_cobro(uuid) FROM PUBLIC, anon, authenticated;


-- ══ 3. Cobrar la licencia ═════════════════════════════════════════════════
CREATE FUNCTION public.registrar_pago_licencia_atomico(
  p_jugador_id uuid,
  p_anio integer,
  p_monto integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb;
  v_nombre text; v_movimiento_id uuid; v_anio_cobro integer;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubes
    WHERE id = v_club_id AND 'licencia_anual' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[]))
  ) THEN RAISE EXCEPTION 'La licencia anual no está habilitada para este club'; END IF;

  -- El año lo manda la pantalla y se compara con la configuración: si el
  -- admin cambió de año con la ficha abierta, se rechaza en vez de anotar
  -- la licencia en un año que quien apretó no estaba viendo.
  v_anio_cobro := public._licencia_anio_cobro(v_club_id);
  IF p_anio IS DISTINCT FROM v_anio_cobro THEN
    RAISE EXCEPTION 'Ahora se cobra la licencia %; recarga la ficha', v_anio_cobro;
  END IF;

  SELECT nombre INTO v_nombre
  FROM public.jugadores WHERE id = p_jugador_id AND club_id = v_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado en el club'; END IF;

  IF p_monto IS NULL OR p_monto < 0 THEN RAISE EXCEPTION 'El monto no puede ser negativo'; END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'pago_licencia');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  IF EXISTS (SELECT 1 FROM public.licencias_pagadas WHERE jugador_id = p_jugador_id AND anio = p_anio) THEN
    RAISE EXCEPTION 'La licencia % de este jugador ya está confirmada', p_anio;
  END IF;

  -- Solo hay movimiento si entró plata, igual que la matrícula.
  IF p_monto > 0 THEN
    INSERT INTO public.movimientos (
      club_id, jugador_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre
    ) VALUES (
      v_club_id, p_jugador_id, 'ingreso', 'licencia',
      'Pago licencia año ' || p_anio || ' — ' || v_nombre, p_monto, v_fecha, v_admin_nombre
    ) RETURNING id INTO v_movimiento_id;

    INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
    VALUES (v_club_id, 'movimientos', v_movimiento_id, 'crear',
      jsonb_build_object('tipo', 'ingreso', 'categoria', 'licencia', 'monto', p_monto,
                         'jugador_id', p_jugador_id, 'anio', p_anio), v_user_id);
  END IF;

  INSERT INTO public.licencias_pagadas (club_id, jugador_id, anio, monto, fecha, movimiento_id, registrado_por_nombre)
  VALUES (v_club_id, p_jugador_id, p_anio, p_monto, v_fecha, v_movimiento_id, v_admin_nombre);

  v_resultado := jsonb_build_object('movimiento_id', v_movimiento_id, 'monto', p_monto, 'anio', p_anio);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_licencia_atomico(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_licencia_atomico(uuid, integer, integer, uuid) TO authenticated;


-- ══ 4. Desmarcar, sin tocar Finanzas ══════════════════════════════════════
-- Mismo criterio que `desmarcarMatricula`: la plata que entró, entró, y un mes
-- cerrado no cambia de saldo porque después se corrija la ficha. Desmarcar
-- significa "de acá en adelante figura como no pagada". Queda el rastro en
-- audit_log con lo que se borró, incluido el movimiento al que apuntaba.
CREATE FUNCTION public.desmarcar_licencia_atomico(
  p_jugador_id uuid,
  p_anio integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_fila public.licencias_pagadas%ROWTYPE;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  DELETE FROM public.licencias_pagadas
  WHERE jugador_id = p_jugador_id AND anio = p_anio AND club_id = v_club_id
  RETURNING * INTO v_fila;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa licencia no estaba confirmada'; END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, user_id)
  VALUES (v_club_id, 'licencias_pagadas', v_fila.id, 'desmarcar',
    jsonb_build_object('jugador_id', v_fila.jugador_id, 'anio', v_fila.anio, 'monto', v_fila.monto,
                       'fecha', v_fila.fecha, 'movimiento_id', v_fila.movimiento_id), v_user_id);

  RETURN jsonb_build_object('anio', v_fila.anio);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.desmarcar_licencia_atomico(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desmarcar_licencia_atomico(uuid, integer) TO authenticated;


-- ══ 5. El módulo, encendido solo en Buin ══════════════════════════════════
UPDATE public.clubes
SET modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'licencia_anual')
WHERE id = _migracion_para_club('Asociación TDM Buin y Paine')
  AND NOT ('licencia_anual' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;


-- ── Verificación (solo lee; se puede correr aparte) ───────────────────────
-- 1) La tabla existe, vacía, y está publicada en realtime: 0 y una fila.
-- SELECT count(*) AS deberia_ser_cero FROM licencias_pagadas;
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'licencias_pagadas';

-- 2) El módulo quedó solo en Buin: una fila, Asociación TDM Buin y Paine.
-- SELECT nombre FROM clubes WHERE 'licencia_anual' = ANY(modulos_habilitados);

-- 3) Sin fila en club_config, el año que se cobra es 2027.
-- SELECT _licencia_anio_cobro(id) FROM clubes WHERE nombre = 'Asociación TDM Buin y Paine';
