-- Resultado definitivo, felicitaciones y lecturas persistentes.

alter table public.torneos
  add column if not exists campeon_id uuid references public.jugadores(id) on delete set null,
  add column if not exists subcampeon_id uuid references public.jugadores(id) on delete set null;

create index if not exists torneos_campeon_idx on public.torneos (campeon_id);

create table if not exists public.torneo_felicitaciones (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  creado_en timestamptz not null default now(),
  constraint torneo_felicitaciones_unica unique (torneo_id, jugador_id)
);

alter table public.torneo_felicitaciones
  add column if not exists creado_en timestamptz not null default now();

create unique index if not exists torneo_felicitaciones_torneo_jugador_uidx
  on public.torneo_felicitaciones (torneo_id, jugador_id);

alter table public.torneo_felicitaciones enable row level security;

drop policy if exists "torneo_felicitaciones_select" on public.torneo_felicitaciones;
create policy "torneo_felicitaciones_select" on public.torneo_felicitaciones
  for select using (
    exists (
      select 1 from public.torneos t
      where t.id = torneo_id and t.club_id = get_my_club_id()
    )
  );

drop policy if exists "torneo_felicitaciones_jugador_insert" on public.torneo_felicitaciones;
create policy "torneo_felicitaciones_jugador_insert" on public.torneo_felicitaciones
  for insert with check (
    jugador_id = get_my_jugador_id()
    and exists (
      select 1 from public.torneos t
      where t.id = torneo_id
        and t.club_id = get_my_club_id()
        and t.estado = 'finalizado'
        and t.campeon_id is not null
        and t.campeon_id <> jugador_id
    )
  );

drop policy if exists "torneos_profesor_insert" on public.torneos;
create policy "torneos_profesor_insert" on public.torneos
  for insert with check (
    club_id = get_my_club_id() and get_my_rol() = 'profesor'
  );

create table if not exists public.notificaciones_leidas (
  user_id uuid not null references auth.users(id) on delete cascade,
  notificacion_id text not null,
  leida_en timestamptz not null default now(),
  primary key (user_id, notificacion_id)
);

alter table public.notificaciones_leidas enable row level security;

drop policy if exists "notificaciones_leidas_propias" on public.notificaciones_leidas;
create policy "notificaciones_leidas_propias" on public.notificaciones_leidas
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.torneo_felicitaciones;
exception when duplicate_object then null;
end $$;
