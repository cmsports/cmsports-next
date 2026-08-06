-- Club real de procedencia del jugador (torneos externos). Solo aplica a
-- fichas es_externo = true; los jugadores del club anfitrión no lo usan.
alter table public.jugadores add column if not exists club_procedencia text;
