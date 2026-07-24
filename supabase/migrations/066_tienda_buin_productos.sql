create table if not exists tienda_buin_productos (
  id          uuid        default gen_random_uuid() primary key,
  club_id     uuid        references clubes(id) on delete cascade not null,
  nombre      text        not null,
  descripcion text,
  categoria   text        not null check (categoria in ('maderos','gomas','pelotas','accesorios','vestimenta','otros')),
  stock       integer     not null default 0,
  precio      integer,
  imagen_url  text,
  creado_en   timestamptz default now()
);

create index if not exists tienda_buin_prod_club_idx on tienda_buin_productos(club_id);

alter table tienda_buin_productos enable row level security;

create policy "tienda_buin_read" on tienda_buin_productos for select
  using (club_id in (select club_id from perfiles where id = auth.uid()));

create policy "tienda_buin_manage" on tienda_buin_productos for all
  using (club_id in (
    select club_id from perfiles where id = auth.uid()
    and rol in ('admin','superadmin','profesor')
  ));
