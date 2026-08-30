-- ────────────────────────────────────────────────────────────
-- Torneos: guardar también los PUNTOS del partido, no solo los sets.
--
-- La migración 216 le dio a `torneo_partidos` sus `sets_a`/`sets_b` para poder
-- repartir el BYE del cuadro por mérito. Faltó un escalón: el ratio de sets no
-- alcanza para desempatar a tres en un grupo. En un grupo de 3 donde cada uno
-- gana uno, lo normal es que los tres queden 3-1 y 1-3 — mismos puntos, mismos
-- sets — y hoy eso obliga al juez a desempatar a mano. El estándar baja
-- entonces al ratio de PUNTOS, y para tenerlo hay que sumar los parciales.
--
-- `puntos_a`/`puntos_b` son el TOTAL de puntos del partido (la suma de todos
-- los sets), no el parcial de cada set. Es lo único que consume el desempate.
-- El detalle set a set se pide en pantalla para poder validarlo (un set se gana
-- a 11 con dos de ventaja) pero no se guarda: ver la nota del final.
--
-- Solo agrega columnas: no borra, no modifica y no reescribe ninguna fila
-- existente. Los partidos cargados con los botones 3-1 de la 216 quedan con
-- `puntos_a`/`puntos_b` en NULL y cuentan como 0 a favor y 0 en contra, igual
-- que hace la 216 con los partidos anteriores a ella.
--
-- Este cambio es de esquema y aplica a TODOS los clubes que usen Torneos.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('225_torneo_partidos_puntos');

ALTER TABLE torneo_partidos
  ADD COLUMN puntos_a integer,
  ADD COLUMN puntos_b integer;

COMMENT ON COLUMN torneo_partidos.puntos_a IS
  'Puntos TOTALES de jugador_a sumando todos los sets. NULL en partidos cargados antes de la migración 225.';
COMMENT ON COLUMN torneo_partidos.puntos_b IS
  'Puntos TOTALES de jugador_b sumando todos los sets. NULL en partidos cargados antes de la migración 225.';

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
-- Espera 2 filas, is_nullable = YES, column_default = NULL:
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'torneo_partidos' AND column_name IN ('puntos_a', 'puntos_b')
-- ORDER BY column_name;

-- ── Por qué no se guarda el detalle set a set ─────────────────────────────
-- Guardar los parciales (11-9, 11-7, …) pediría una tercera copia del mismo
-- dato: los sets ya están en `sets_a`/`sets_b` y los puntos acá, y ambos se
-- derivan de los parciales. Ninguna regla deportiva los necesita. Si algún día
-- hay que imprimir la planilla oficial del partido, ahí sí conviene una columna
-- `parciales jsonb` y derivar de ella las otras cuatro.
