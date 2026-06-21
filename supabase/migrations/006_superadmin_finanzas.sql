-- ============================================================
-- CmSports — Finanzas del superadmin (ingresos SaaS por club)
-- ============================================================
-- Qué hace:
--   1. Agrega a "clubes" el plan mensual que cada club le paga
--      a CmSports y su estado de pago.
--   2. Crea "pagos_clubes" para el historial de pagos recibidos.
-- ============================================================

alter table clubes add column if not exists plan_mensual numeric not null default 0;
alter table clubes add column if not exists estado_pago text not null default 'pendiente';

alter table clubes drop constraint if exists clubes_estado_pago_check;
alter table clubes add constraint clubes_estado_pago_check
  check (estado_pago in ('pagado', 'pendiente', 'atrasado'));

create table if not exists pagos_clubes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubes(id) on delete cascade,
  monto numeric not null,
  periodo_mes int not null,
  periodo_anio int not null,
  fecha_pago date not null default current_date,
  metodo text,
  notas text,
  creado_en timestamptz not null default now()
);

alter table pagos_clubes enable row level security;

drop policy if exists "pagos_clubes_superadmin_all" on pagos_clubes;
create policy "pagos_clubes_superadmin_all" on pagos_clubes
  for all using (get_my_rol() = 'superadmin')
  with check (get_my_rol() = 'superadmin');
