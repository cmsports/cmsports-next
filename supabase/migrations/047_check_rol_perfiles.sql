-- Restringe los valores válidos de rol en perfiles a nivel de base de datos.
-- Antes era un string libre — cualquier valor era aceptado por Postgres.
ALTER TABLE perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('superadmin', 'admin', 'profesor', 'jugador'));
