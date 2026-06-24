-- ────────────────────────────────────────────────────────────
-- El jugador ahora define su propia contraseña al enviar la
-- solicitud de ingreso. Se guarda temporalmente aquí y se usa
-- para crear la cuenta cuando el admin aprueba; luego se borra.
-- ────────────────────────────────────────────────────────────
alter table solicitudes_jugador add column if not exists password text;
