-- ────────────────────────────────────────────────────────────
-- Las dos migraciones anuladas que faltaban en el registro.
--
-- ── El hueco ──────────────────────────────────────────────────────────────
-- La 128 creó el portazo y aprovechó para inscribir retroactivamente lo
-- peligroso ya corrido. Pero solo inscribió dos nombres:
--
--     INSERT INTO _migraciones_aplicadas (nombre, aplicada_por) VALUES
--       ('089_arranque_limpio_buin', 'registro retroactivo'),
--       ('128_registro_de_migraciones', current_user)
--
-- El CLAUDE.md nombra TRES migraciones que nunca deben re-ejecutarse:
-- `089_arranque_limpio_buin`, `060_limpiar_jugadores_externos` y
-- `081_baja_jugadores_retirados`. Las dos que faltan dependen hoy de una sola
-- barrera: el `DO $$ RAISE EXCEPTION $$` que tienen al principio del archivo.
--
-- Esa barrera está y funciona. Pero es una barrera que vive DENTRO del texto
-- que hay que copiar y pegar. Alcanza con que alguien seleccione desde el
-- primer `UPDATE` hacia abajo —buscando "solo la parte que me interesa"— para
-- que no exista ninguna protección. Y son justamente las dos que borran
-- jugadores y cuentas sin respaldo.
--
-- ── Qué hace ──────────────────────────────────────────────────────────────
-- Las inscribe en `_migraciones_aplicadas`. A partir de acá, cualquier intento
-- de correrlas que incluya su `SELECT _migracion_nueva(...)` se aborta solo.
-- Es la segunda barrera, independiente de que alguien copie bien el archivo.
--
-- `ON CONFLICT DO NOTHING` para que sea inofensiva si alguien ya las agregó
-- a mano.
--
-- No toca datos de ningún club.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('231_registrar_migraciones_anuladas');

INSERT INTO _migraciones_aplicadas (nombre, aplicada_por) VALUES
  ('060_limpiar_jugadores_externos', 'registro retroactivo (226/231)'),
  ('081_baja_jugadores_retirados',   'registro retroactivo (231)')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- Las tres anuladas del CLAUDE.md tienen que estar las tres.
SELECT nombre, aplicada_en, aplicada_por
FROM _migraciones_aplicadas
WHERE nombre IN (
  '060_limpiar_jugadores_externos',
  '081_baja_jugadores_retirados',
  '089_arranque_limpio_buin'
)
ORDER BY nombre;
-- Tiene que devolver 3 filas.
