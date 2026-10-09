-- Desmarcar la licencia ahora ANULA el pago: quita la marca y borra su
-- ingreso en Finanzas, en una sola transacción.
--
-- ── Por qué ───────────────────────────────────────────────────────────────
-- Con la 301, desmarcar dejaba el ingreso en Finanzas, y volver a marcar
-- registraba un SEGUNDO ingreso por la misma licencia. Y al revés: borrar el
-- ingreso desde Finanzas dejaba la ficha diciendo "pagada". Dos pasos en dos
-- pantallas que se descuadraban solos. El usuario pidió (2026-10-09) que
-- desmarcar y volver a marcar nunca duplique el ingreso, y eligió que
-- desmarcar lo borre — igual que revertir el cobro de una clase extra (099).
--
-- ── Las dos piezas ────────────────────────────────────────────────────────
-- 1. `desmarcar_licencia_atomico` borra la marca y su movimiento, y deja en
--    audit_log las dos cosas con lo que valían.
-- 2. El ingreso de una licencia queda con candado en Finanzas: no se edita ni
--    se borra suelto, se anula desde la ficha. Así no se vuelven a separar.
--
-- ── Cómo se pone el candado sin pisar nada ────────────────────────────────
-- El candado de Finanzas vive en `_movimiento_editable` (105), que llaman
-- `editar_movimiento_financiero_atomico` y `eliminar_movimiento_financiero_atomico`.
-- El repo va atrás de la base, así que reescribirla desde la copia de la 105
-- podría borrar una regla que solo está en producción. En vez de eso se
-- RENOMBRA la que existe —con el cuerpo que tenga hoy— a
-- `_movimiento_editable_base`, y una nueva con el nombre de siempre revisa la
-- licencia y después la llama. Los dos RPC la encuentran por nombre al correr,
-- así que pasan por la nueva sin tocarlos.
--
-- Afecta a todos los clubes solo en la forma: el control nuevo mira
-- `licencias_pagadas`, que solo tiene filas de Buin. Para un movimiento de
-- otro club responde exactamente lo mismo que antes.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('302_licencia_anular_pago');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');


-- ══ 1. Desmarcar = anular el pago ═════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.desmarcar_licencia_atomico(
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
  v_mov jsonb; v_afectadas integer;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  DELETE FROM public.licencias_pagadas
  WHERE jugador_id = p_jugador_id AND anio = p_anio AND club_id = v_club_id
  RETURNING * INTO v_fila;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa licencia no estaba confirmada'; END IF;

  -- El ingreso, si lo hubo. Puede faltar: monto 0 no genera movimiento, y uno
  -- borrado desde Finanzas antes de esta migración dejó movimiento_id en NULL.
  IF v_fila.movimiento_id IS NOT NULL THEN
    SELECT to_jsonb(m) INTO v_mov FROM public.movimientos m
    WHERE m.id = v_fila.movimiento_id AND m.club_id = v_club_id;

    IF v_mov IS NOT NULL THEN
      DELETE FROM public.movimientos WHERE id = v_fila.movimiento_id AND club_id = v_club_id;
      GET DIAGNOSTICS v_afectadas = ROW_COUNT;
      IF v_afectadas <> 1 THEN RAISE EXCEPTION 'No se pudo borrar el ingreso de la licencia'; END IF;

      INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, user_id)
      VALUES (v_club_id, 'movimientos', v_fila.movimiento_id, 'eliminar', v_mov, v_user_id);
    END IF;
  END IF;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, before, user_id)
  VALUES (v_club_id, 'licencias_pagadas', v_fila.id, 'anular_pago',
    jsonb_build_object('jugador_id', v_fila.jugador_id, 'anio', v_fila.anio, 'monto', v_fila.monto,
                       'fecha', v_fila.fecha, 'movimiento_id', v_fila.movimiento_id), v_user_id);

  RETURN jsonb_build_object('anio', v_fila.anio, 'movimiento_borrado', v_mov IS NOT NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.desmarcar_licencia_atomico(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desmarcar_licencia_atomico(uuid, integer) TO authenticated;


-- ══ 2. El candado en Finanzas ═════════════════════════════════════════════
ALTER FUNCTION public._movimiento_editable(uuid, uuid) RENAME TO _movimiento_editable_base;

CREATE FUNCTION public._movimiento_editable(
  p_movimiento_id uuid,
  p_club_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.licencias_pagadas WHERE movimiento_id = p_movimiento_id) THEN
    RAISE EXCEPTION 'Este movimiento es el pago de una licencia. Se corrige anulando el pago desde la ficha del jugador.';
  END IF;
  RETURN public._movimiento_editable_base(p_movimiento_id, p_club_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._movimiento_editable(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._movimiento_editable_base(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;


-- ── Verificación (solo lee; se puede correr aparte) ───────────────────────
-- Las dos funciones existen y el RPC nuevo borra movimientos: una fila con
-- true, true, true.
-- SELECT
--   to_regprocedure('public._movimiento_editable(uuid,uuid)') IS NOT NULL      AS candado,
--   to_regprocedure('public._movimiento_editable_base(uuid,uuid)') IS NOT NULL AS regla_original,
--   (SELECT prosrc ILIKE '%DELETE FROM public.movimientos%' FROM pg_proc
--     WHERE proname = 'desmarcar_licencia_atomico')                            AS anula_ingreso;
