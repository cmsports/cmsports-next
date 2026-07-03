-- ============================================================
-- CmSports — Multi-club + rol superadmin + limpieza de datos
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Revisa el PASO 4 (borrado de datos) antes de correrlo —
--      es irreversible, borra TODOS los jugadores/torneos/clases/
--      asistencia/mensualidades/finanzas actuales.
--   3. Pega TODO este archivo y haz clic en "Run"
--
--   4. Cuenta superadmin (hazlo ANTES de correr este SQL, o
--      después da igual — son pasos independientes):
--      a) Supabase Dashboard → Authentication → Users → "Add user"
--         Crea el usuario con tu email/password elegidos para superadmin.
--      b) Copia el UUID del usuario recién creado.
--      c) Corre este insert (cambia el UUID y el email):
--           insert into perfiles (id, email, nombre, rol, club_id)
--           values ('PEGA-EL-UUID-AQUI', 'tu-email@ejemplo.com', 'Tu Nombre', 'superadmin', null);
--      d) Entra a /login con ese email/password — el proxy te
--         mandará a /superadmin.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PASO 0: Permitir el rol 'superadmin' en perfiles
-- ────────────────────────────────────────────────────────────
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'profesor', 'jugador', 'superadmin'));

-- ────────────────────────────────────────────────────────────
-- PASO 1: Crear los clubes
-- ────────────────────────────────────────────────────────────
insert into clubes (nombre, ciudad, deporte)
values ('Club Paine', 'Paine', 'tenis de mesa')
on conflict do nothing;

insert into clubes (nombre, ciudad, deporte)
values ('Club Unión San Bernardo', 'San Bernardo', 'tenis de mesa')
on conflict do nothing;

-- ────────────────────────────────────────────────────────────
-- PASO 2: Policies de clubes — superadmin ve y administra todos
-- ────────────────────────────────────────────────────────────
drop policy if exists "clubes_select" on clubes;
create policy "clubes_select" on clubes
  for select using (id = get_my_club_id() or get_my_rol() = 'superadmin');

drop policy if exists "clubes_superadmin_all" on clubes;
create policy "clubes_superadmin_all" on clubes
  for all using (get_my_rol() = 'superadmin')
  with check (get_my_rol() = 'superadmin');

-- ────────────────────────────────────────────────────────────
-- PASO 3: Reasignar tu cuenta admin actual al club Paine
-- (asume que hoy tienes un solo perfil admin — si tienes más
-- de uno, ajusta el WHERE para apuntar al correcto)
-- ────────────────────────────────────────────────────────────
update perfiles
set club_id = (select id from clubes where nombre = 'Club Paine')
where rol = 'admin';

-- ────────────────────────────────────────────────────────────
-- PASO 4: Borrar TODOS los datos de prueba (irreversible)
-- Orden: hijos antes que padres para respetar FKs
-- ────────────────────────────────────────────────────────────
delete from historial_elo;
delete from evaluaciones_trimestrales;

delete from torneo_pagos;
delete from torneo_partidos;
delete from partidos;
delete from grupo_jugadores;
delete from torneo_grupos;
delete from torneo_jugadores;
delete from torneos_externos;
delete from torneos;

delete from reservas;
delete from clase_jugadores;
delete from clases;

delete from asistencia;

delete from movimientos;
delete from cuotas;
delete from mensualidades;

delete from solicitudes_jugador;
delete from invitaciones;
delete from eventos;

update perfiles set jugador_id = null;
delete from jugadores;
delete from profesores;

-- perfiles y usuarios (cuentas de login) NO se borran
