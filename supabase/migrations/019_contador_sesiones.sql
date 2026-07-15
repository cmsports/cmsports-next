-- Ajuste atómico del contador de sesiones.
-- delta = +1 al marcar asistencia y -1 al eliminarla.
create or replace function ajustar_sesiones(p_jugador_id uuid, p_delta int)
returns void
language sql
as $$
  update jugadores
  set sesiones_usadas = greatest(0, coalesce(sesiones_usadas, 0) + p_delta)
  where id = p_jugador_id;
$$;
