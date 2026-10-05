-- El ranking mostraba "Desconocido" y sin foto a TODOS los competidores cuando
-- quien lo miraba era un jugador.
--
-- Causa: la política `jugadores_select` (migración 131) deja que un jugador lea
-- SOLO su propia ficha (`id = get_my_jugador_id()`). El ranking calcula puestos
-- y puntos desde `torneo_partidos` —que sí puede leer— pero los nombres y las
-- fotos salían de un SELECT directo a `jugadores`, que RLS le devolvía vacío
-- para todos menos él. De ahí que faltara a la vez el nombre y la foto.
--
-- Esta función devuelve SOLO lo que el ranking necesita pintar —id, nombre y la
-- ruta de la foto— de los jugadores del club de quien pregunta, sin abrir el
-- resto de la ficha (RUT, contacto, etc.), que la 046/131 cerraron a propósito.
-- La usan los dos lectores del ranking: la pantalla /ranking con la sesión del
-- usuario, y la API pública del QR con el cliente de servicio.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________

BEGIN;
SELECT _migracion_nueva('300_jugadores_para_ranking');
SELECT _migracion_para_todos_los_clubes('crea una función de lectura compartida; no modifica filas');

CREATE OR REPLACE FUNCTION public.jugadores_para_ranking(p_ids uuid[])
RETURNS TABLE (id uuid, nombre text, foto_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT j.id, j.nombre, j.foto_path
  FROM jugadores j
  WHERE j.id = ANY(p_ids)
    AND (
      -- QR público: lo lee el cliente de servicio, que no tiene "mi club".
      auth.role() = 'service_role'
      -- El superadmin ve todos los clubes, igual que en jugadores_select.
      OR get_my_rol() = 'superadmin'
      -- Staff y jugador: solo nombres/fotos de su propio club.
      OR j.club_id = get_my_club_id()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.jugadores_para_ranking(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.jugadores_para_ranking(uuid[]) TO authenticated, service_role;

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe existir la función y ser SECURITY DEFINER (prosecdef = true).
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'jugadores_para_ranking';
