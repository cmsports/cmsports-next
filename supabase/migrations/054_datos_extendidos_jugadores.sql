-- Campos extendidos de jugador (requeridos por Club Buin, disponibles para todos los clubes).
-- fecha_nacimiento, comuna, grupo y horario ya existen (import previo); solo se agrega lo que falta.
alter table jugadores
  add column if not exists direccion text,
  add column if not exists contacto_emergencia_nombre text,
  add column if not exists contacto_emergencia_telefono text,
  add column if not exists indicaciones_medicas text,
  add column if not exists federado boolean;
