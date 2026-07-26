-- Tienda Buin (catálogo de la Asociación) — copia independiente de la tienda
-- del profe (tienda_buin_productos, ahora la página /tienda-profe). Misma
-- estructura, tabla y storage separados para que ambos catálogos se
-- administren de forma independiente.

create table if not exists tienda_asociacion_productos (
  id          uuid        default gen_random_uuid() primary key,
  club_id     uuid        references clubes(id) on delete cascade not null,
  nombre      text        not null,
  descripcion text,
  categoria   text        not null check (categoria in ('maderos','gomas','pelotas','accesorios','vestimenta','otros')),
  color       text,
  stock       integer     not null default 0,
  precio      integer,
  imagen_url  text,
  creado_en   timestamptz default now()
);

create index if not exists tienda_asociacion_prod_club_idx on tienda_asociacion_productos(club_id);

alter table tienda_asociacion_productos enable row level security;

create policy "tienda_asociacion_read" on tienda_asociacion_productos for select
  using (club_id in (select club_id from perfiles where id = auth.uid()));

create policy "tienda_asociacion_manage" on tienda_asociacion_productos for all
  using (club_id in (
    select club_id from perfiles where id = auth.uid()
    and rol in ('admin','superadmin','profesor')
  ));

-- Habilita el módulo nuevo para Asociación Buin (ajusta el club_id si aplica a otro club).
update clubes
set modulos_habilitados = array_append(modulos_habilitados, 'tienda_asociacion')
where id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  and not ('tienda_asociacion' = any(modulos_habilitados));
