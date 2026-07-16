-- Los flujos seguros usan estos métodos: registro manual del staff,
-- autorregistro del jugador y kiosco público mediante RUT.
ALTER TABLE public.asistencia
  DROP CONSTRAINT IF EXISTS asistencia_metodo_check;

ALTER TABLE public.asistencia
  ADD CONSTRAINT asistencia_metodo_check
  CHECK (metodo IS NULL OR metodo IN ('manual', 'qr', 'autoregistro', 'rut'));
