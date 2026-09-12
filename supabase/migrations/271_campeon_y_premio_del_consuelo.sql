-- El campeón del cuadro de consuelo queda registrado, y puede llevar premio.
--
-- Este cambio afecta a: TODOS los clubes en el esquema, NINGUNO en su
-- comportamiento. Agrega dos columnas que solo escribe el formato
-- "eliminación + consolación" (hoy Spinhouse), y reescribe el RPC de premios
-- con un parámetro nuevo opcional: llamado como hasta hoy, hace lo mismo.
--
-- ══ Qué faltaba ═══════════════════════════════════════════════════════════
-- El formato dice "el que pierde temprano cae a un segundo cuadro que tiene
-- su propio campeón" (src/lib/domain/torneoConsolacion.ts). Pero ese campeón
-- no quedaba en ninguna parte: `finalizarTorneo` guardaba campeón, subcampeón
-- y tercero del cuadro principal, y el panel de premios solo tenía tres
-- lugares. La pestaña "Bracket de consuelo" lo nombraba en pantalla y nada
-- más — cerrado el torneo, se perdía.
--
-- ══ Qué queda ═════════════════════════════════════════════════════════════
--   · `torneos.campeon_consuelo_id`: lo llena `finalizarTorneo` con el ganador
--     de `cons_final`. ON DELETE SET NULL, como el resto del podio: borrar la
--     ficha no borra el torneo.
--   · `torneos.premio_consuelo`: el monto, al lado de los otros tres.
--   · `guardar_premios_torneo_atomico(..., p_consuelo integer DEFAULT NULL)`:
--     mismo cuerpo, un premio más. Se hace DROP + CREATE y no un overload: con
--     dos firmas y un DEFAULT, PostgREST no sabe cuál elegir y rechaza la
--     llamada ("could not choose the best candidate function").
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('271_campeon_y_premio_del_consuelo');
SELECT _migracion_para_todos_los_clubes(
  'agrega campeon_consuelo_id y premio_consuelo a torneos y un parámetro opcional al RPC de premios; no toca ninguna fila');

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS campeon_consuelo_id uuid REFERENCES public.jugadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS premio_consuelo integer;

COMMENT ON COLUMN public.torneos.campeon_consuelo_id IS
  'Ganador de cons_final en eliminación + consolación. NULL en los demás formatos.';
COMMENT ON COLUMN public.torneos.premio_consuelo IS
  'Premio al campeón del consuelo, junto a premio_primero/segundo/tercero.';

DROP FUNCTION IF EXISTS public.guardar_premios_torneo_atomico(uuid, text, integer, integer, integer, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.guardar_premios_torneo_atomico(
  p_torneo_id uuid,
  p_torneo_nombre text,
  p_primero integer,
  p_segundo integer,
  p_tercero integer,
  p_metodo text,
  p_gastos jsonb,
  p_idempotency_key uuid,
  p_consuelo integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb;
  v_via text;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_gasto jsonb;
  v_tipo text; v_monto integer;
  v_movimientos_creados integer := 0;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;

  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.torneos WHERE id = p_torneo_id AND club_id = v_club_id) THEN
    RAISE EXCEPTION 'Torneo no encontrado en el club';
  END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'guardar_premios_torneo');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  v_via := CASE WHEN p_metodo = 'transferencia' THEN ' (transferencia)' ELSE ' (efectivo)' END;

  UPDATE public.torneos
  SET premio_primero = p_primero, premio_segundo = p_segundo, premio_tercero = p_tercero,
      premio_consuelo = p_consuelo
  WHERE id = p_torneo_id;

  IF p_primero IS NOT NULL AND p_primero > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 1°' || v_via || ' — ' || p_torneo_nombre, p_primero, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;
  IF p_segundo IS NOT NULL AND p_segundo > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 2°' || v_via || ' — ' || p_torneo_nombre, p_segundo, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;
  IF p_tercero IS NOT NULL AND p_tercero > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio 3°' || v_via || ' — ' || p_torneo_nombre, p_tercero, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;
  IF p_consuelo IS NOT NULL AND p_consuelo > 0 THEN
    INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
    VALUES (v_club_id, p_torneo_id, 'gasto', 'premio_torneo', 'Premio campeón del consuelo' || v_via || ' — ' || p_torneo_nombre, p_consuelo, v_fecha, v_admin_nombre);
    v_movimientos_creados := v_movimientos_creados + 1;
  END IF;

  FOR v_gasto IN SELECT * FROM jsonb_array_elements(coalesce(p_gastos, '[]'::jsonb))
  LOOP
    v_tipo := btrim(v_gasto->>'tipo');
    v_monto := nullif(v_gasto->>'monto', '')::integer;
    IF v_tipo IS NOT NULL AND v_tipo <> '' AND v_monto IS NOT NULL AND v_monto > 0 THEN
      INSERT INTO public.movimientos (club_id, torneo_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
      VALUES (v_club_id, p_torneo_id, 'gasto', 'otro_gasto', v_tipo || ' — ' || p_torneo_nombre, v_monto, v_fecha, v_admin_nombre);
      v_movimientos_creados := v_movimientos_creados + 1;
    END IF;
  END LOOP;

  IF v_movimientos_creados > 0 THEN
    UPDATE public.torneos SET contabilidad_enviada = true WHERE id = p_torneo_id;
  END IF;

  v_resultado := jsonb_build_object('movimientos_creados', v_movimientos_creados);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_premios_torneo_atomico(uuid, text, integer, integer, integer, text, jsonb, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_premios_torneo_atomico(uuid, text, integer, integer, integer, text, jsonb, uuid, integer) TO authenticated;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- 1) Las dos columnas existen.
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'torneos' AND column_name IN ('campeon_consuelo_id', 'premio_consuelo');

-- 2) Una sola versión del RPC, con 9 parámetros.
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'guardar_premios_torneo_atomico';
