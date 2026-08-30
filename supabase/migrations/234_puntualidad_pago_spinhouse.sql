-- ────────────────────────────────────────────────────────────
-- Queda registrado si el jugador pagó dentro del plazo o atrasado.
--
-- Este cambio afecta a: Spinhouse (club 2d8e7c36-…). La columna se agrega para
-- todos —el esquema es uno solo— pero el módulo que la llena queda encendido
-- solo en Spinhouse, así que en Buin nadie la escribe y siempre vale NULL.
--
-- ── Por qué NO se deduce de la fecha ──────────────────────────────────────
-- La primera idea fue comparar `fecha_pago` contra un día límite del mes. Está
-- mal: `fecha_pago` es cuándo el ADMIN registró el pago, no cuándo el jugador
-- pagó. El admin que se pone al día el 20 con los pagos de la primera semana
-- dejaría a todo el club marcado como atrasado, y el dato quedaría midiendo la
-- prolijidad del admin en vez de la del jugador.
--
-- Así que no se deduce: lo declara quien cobra, que es el único que sabe. Un
-- solo campo, tres valores posibles vistos desde la pantalla:
--
--   · pagó en plazo   → estado 'pagado'  + puntualidad 'a_tiempo'
--   · pagó atrasado   → estado 'pagado'  + puntualidad 'atrasado'
--   · mes gratis      → estado 'exento'  + el motivo del premio en `notas`
--
-- El tercero no necesita nada nuevo: `eximir_mensualidad_atomico` (migración
-- 203) ya deja la cuota exenta, con su línea en $0 en Finanzas, su rastro en
-- audit_log y su botón de deshacer. Un "mes gratis" es exactamente eso con
-- otro motivo escrito.
--
-- ── Por qué un RPC aparte y no un parámetro más en el pago ────────────────
-- `registrar_pago_mensualidad_atomico` es el camino por el que entra la plata
-- de Buin, el único club con dinero real. Agregarle un parámetro para una
-- función que Buin no usa es tocar la caja del vecino sin necesidad.
--
-- El precio de separarlo es que son dos llamadas y la segunda puede fallar. La
-- consecuencia de esa falla es una etiqueta vacía —la cuota queda pagada, la
-- plata registrada, y la pantalla muestra "sin marcar" con el botón para
-- corregirlo—. Es un desenlace visible y reparable; meter mano en el RPC de
-- pagos no lo sería.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('234_puntualidad_pago_spinhouse');

-- ══ 1. La columna ═════════════════════════════════════════════════════════
-- NULL no es "a tiempo": es "nadie lo marcó". Todo lo cobrado antes de esta
-- migración queda así, y tiene que quedar así — inventar que fueron puntuales
-- es exactamente el error que esta columna existe para no cometer.
ALTER TABLE public.mensualidades
  ADD COLUMN IF NOT EXISTS puntualidad text;

ALTER TABLE public.mensualidades DROP CONSTRAINT IF EXISTS mensualidades_puntualidad_check;
ALTER TABLE public.mensualidades ADD CONSTRAINT mensualidades_puntualidad_check
  CHECK (puntualidad IS NULL OR puntualidad IN ('a_tiempo', 'atrasado'));

COMMENT ON COLUMN public.mensualidades.puntualidad IS
  'Lo declara quien registra el pago: a_tiempo | atrasado. NULL = sin marcar (no significa a tiempo). No se deduce de fecha_pago, que es cuándo se registró y no cuándo se pagó.';


-- ══ 2. El RPC que la escribe ══════════════════════════════════════════════
-- Sin idempotencia ni movimiento: no mueve plata, solo etiqueta una fila que
-- ya está pagada. Repetirlo es inofensivo, y por eso se puede corregir tantas
-- veces como haga falta.
CREATE OR REPLACE FUNCTION public.marcar_puntualidad_pago(
  p_mensualidad_id uuid,
  p_puntualidad    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid;
  v_estado text; v_antes text;
BEGIN
  SELECT c.club_id, c.user_id INTO v_club_id, v_user_id
  FROM public._finanzas_admin_contexto() c;

  IF p_puntualidad IS NULL OR p_puntualidad NOT IN ('a_tiempo', 'atrasado') THEN
    RAISE EXCEPTION 'Puntualidad inválida: se espera a_tiempo o atrasado';
  END IF;

  SELECT m.estado, m.puntualidad INTO v_estado, v_antes
  FROM public.mensualidades m
  WHERE m.id = p_mensualidad_id AND m.club_id = v_club_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad no encontrada en el club'; END IF;

  -- Solo tiene sentido sobre algo cobrado. Marcar "pagó a tiempo" una cuota
  -- pendiente es una contradicción que después nadie sabría leer.
  IF v_estado <> 'pagado' THEN
    RAISE EXCEPTION 'Esa cuota no está pagada: primero registrá el pago';
  END IF;

  UPDATE public.mensualidades SET puntualidad = p_puntualidad
   WHERE id = p_mensualidad_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'mensualidades', p_mensualidad_id, 'marcar_puntualidad',
          jsonb_build_object('puntualidad', p_puntualidad, 'antes', v_antes), v_user_id);

  RETURN jsonb_build_object('mensualidad_id', p_mensualidad_id, 'puntualidad', p_puntualidad);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_puntualidad_pago(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_puntualidad_pago(uuid, text) TO authenticated;


-- ══ 3. Revertir un pago borra su marca ════════════════════════════════════
-- Si no, la cuota vuelve a 'pendiente' arrastrando un 'a_tiempo' de un pago
-- que ya no existe, y al cobrarla de nuevo la marca vieja se lee como nueva.
UPDATE public.mensualidades SET puntualidad = NULL WHERE estado <> 'pagado';

CREATE OR REPLACE FUNCTION public._puntualidad_solo_si_pagado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'pagado' THEN NEW.puntualidad := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntualidad_solo_si_pagado ON public.mensualidades;
CREATE TRIGGER puntualidad_solo_si_pagado
  BEFORE INSERT OR UPDATE ON public.mensualidades
  FOR EACH ROW EXECUTE FUNCTION public._puntualidad_solo_si_pagado();


-- ══ 4. El módulo, solo para Spinhouse ═════════════════════════════════════
-- Mismo patrón que 226, 227 y 228: la diferencia entre clubes es dato.
UPDATE public.clubes
SET modulos_habilitados = (
  SELECT jsonb_agg(DISTINCT m)
  FROM jsonb_array_elements(coalesce(modulos_habilitados, '[]'::jsonb) || '["puntualidad_pago"]'::jsonb) m
)
WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- 1. Solo Spinhouse tiene el módulo (espera una fila):
-- SELECT nombre FROM clubes WHERE modulos_habilitados ? 'puntualidad_pago';
--
-- 2. La columna existe y arranca vacía (espera todo en NULL / sin_marcar):
-- SELECT coalesce(puntualidad, 'sin_marcar') AS puntualidad, count(*)
-- FROM mensualidades WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
-- GROUP BY 1;
--
-- 3. El trigger limpia al revertir. Sobre una cuota pagada cualquiera:
-- UPDATE mensualidades SET puntualidad = 'a_tiempo' WHERE id = '<uuid pagado>';
-- UPDATE mensualidades SET estado = 'pendiente'     WHERE id = '<uuid pagado>';
-- SELECT estado, puntualidad FROM mensualidades WHERE id = '<uuid pagado>';
--   → puntualidad tiene que salir NULL. Acordate de dejar el estado como estaba.
