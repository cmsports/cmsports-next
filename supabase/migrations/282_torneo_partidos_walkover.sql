-- W.O. en torneos: un partido de grupos o de liguilla exige marcador, así que
-- el ausente se cerraba a mano inventando un 3-0. Ahora el partido guarda que
-- fue walkover: el marcador sigue siendo 3-0 (11-0 por set) para que la tabla
-- y los desempates lo cuenten como el estándar, pero la pantalla y los
-- reportes dicen "W.O." y no un resultado jugado.
--
-- Solo agrega una columna con default: no toca ninguna fila.

BEGIN;
SELECT _migracion_nueva('282_torneo_partidos_walkover');
SELECT _migracion_para_todos_los_clubes('cambia el esquema, no toca filas');

ALTER TABLE public.torneo_partidos
  ADD COLUMN IF NOT EXISTS es_walkover boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.torneo_partidos.es_walkover IS
  'El partido se cerró por no presentación (W.O.). El marcador guardado es el reglamentario (3-0, 11-0 por set), no uno jugado.';

COMMIT;
