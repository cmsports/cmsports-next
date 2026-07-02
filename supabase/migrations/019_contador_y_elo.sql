-- ============================================================
-- CmSports — Contador de sesiones atómico + precisión de ELO
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run" (idempotente)
--
-- Qué corrige:
--   1. sesiones_usadas se actualizaba con leer-luego-escribir: dos
--      check-ins simultaneos perdian uno. Ahora es un UPDATE atomico
--      (sin SECURITY DEFINER: respeta el mismo RLS que hoy).
--   2. historial_elo no guardaba a que partido pertenecia cada cambio
--      de ELO, asi que corregir un resultado antiguo podia revertir el
--      partido equivocado. Se agrega partido_id para revertir el exacto.
-- ============================================================

-- ── 1. Ajuste atómico del contador de sesiones ─────────────────────────────
-- delta = +1 al marcar asistencia, -1 al eliminarla. greatest(0, ...) evita
-- que baje de cero. SIN security definer → aplica el RLS de jugadores igual
-- que el UPDATE directo que hacia antes el Server Action.
create or replace function ajustar_sesiones(p_jugador_id uuid, p_delta int)
returns void
language sql
as $$
  update jugadores
  set sesiones_usadas = greatest(0, coalesce(sesiones_usadas, 0) + p_delta)
  where id = p_jugador_id;
$$;

-- ── 2. Vincular cada cambio de ELO a su partido ────────────────────────────
alter table historial_elo add column if not exists partido_id uuid;
create index if not exists historial_elo_partido_idx on historial_elo (partido_id);

-- ============================================================
-- DONE
-- ============================================================
