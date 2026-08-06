-- ⚠️ MIGRACIÓN ANULADA — NO VOLVER A EJECUTAR ⚠️
--
-- Ya se ejecutó: esas seis bajas están hechas. Repetirla vuelve a armar la
-- lista de borrado desde cero y borra jugadores, sus cuentas en auth.users y
-- sus mensualidades, sin respaldo. Los nombres que busca podrían coincidir hoy
-- con otras personas.
--
-- Se anula por la misma razón que la 089: las migraciones de este proyecto se
-- pegan a mano en el SQL Editor y nada impedía repetirlas. Para dar de baja a
-- alguien hoy se usa la app (que llama a `eliminar_jugador_atomico`, corregida
-- en la migración 123 para no borrar su historial financiero), no este
-- archivo. Ver docs/migraciones-destructivas.md.

DO $$
BEGIN
  RAISE EXCEPTION 'Migración 081 anulada: ya se ejecutó. Borra jugadores y sus cuentas sin respaldo. Para dar de baja a alguien, usar la app. Ver docs/migraciones-destructivas.md';
END $$;

-- Baja de seis jugadores que el profe confirmó que ya no entrenan:
--   Luciano Enrique Colmenárez Liendo · Tomás Andrés Contreras Arancibia
--   José Tomás López Peys             · Jesús Enrique Colmenárez Argüello
--   Alberto Andrés Vergara Sánchez    · Álvaro Moya Obregón
--
-- Se resuelven de dos formas distintas, y el motivo importa:
--
-- Los cuatro primeros se borran definitivamente. No tenían partidos jugados,
-- así que salen sin dejar rastro ni afectar a nadie.
--
-- Alberto Vergara y Álvaro Moya se dan de baja pero NO se borran: entre los
-- dos tienen cinco partidos del torneo "primer interno", ya finalizado, y sus
-- rivales —Crisse Acevedo, Cristian Castañeda, Alonso Ramírez y Benjamín
-- Caro— siguen en el club. Borrarlos les habría borrado esos partidos del
-- historial a ellos también.
--
-- La contabilidad no se toca en ninguno de los dos casos: ninguno tenía
-- movimientos de caja asociados.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── 1. Los cuatro sin historial de torneos: baja definitiva ───────────────
CREATE TEMP TABLE _borrar4 AS
SELECT j.id FROM jugadores j
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND public._norm_nombre(j.nombre) IN (
    public._norm_nombre('Luciano Enrique Colmenarez Liendo'),
    public._norm_nombre('Tomás Andrés Contreras Arancibia'),
    public._norm_nombre('José Tomás Lopez Peys'),
    public._norm_nombre('Jesus Enrique Colmenarez Arguello')
  );

-- Freno de mano: en el club hay dos Colmenárez, cuatro López y otro Contreras
-- que se queda. Si el emparejamiento no da exactamente cuatro, no se borra nada.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _borrar4;
  IF n <> 4 THEN RAISE EXCEPTION 'Se esperaban 4 y hay %. No se borró nada.', n; END IF;
END $$;

-- Los ids de las cuentas hay que guardarlos antes de borrar los perfiles: el
-- vínculo con el jugador vive ahí.
CREATE TEMP TABLE _cuentas4 AS
SELECT p.id FROM perfiles p WHERE p.jugador_id IN (SELECT id FROM _borrar4);

-- Estas tablas no borran en cascada, así que hay que vaciarlas primero.
DELETE FROM mensualidades   WHERE jugador_id IN (SELECT id FROM _borrar4);
DELETE FROM torneo_pagos    WHERE jugador_id IN (SELECT id FROM _borrar4);
DELETE FROM grupo_jugadores WHERE jugador_id IN (SELECT id FROM _borrar4);

-- El orden importa: `perfiles.id` apunta a `auth.users`.
DELETE FROM perfiles   WHERE jugador_id IN (SELECT id FROM _borrar4);
DELETE FROM auth.users WHERE id IN (SELECT id FROM _cuentas4);

DELETE FROM jugadores  WHERE id IN (SELECT id FROM _borrar4);


-- ── 2. Los dos con partidos jugados: baja sin borrar ──────────────────────
UPDATE jugadores SET estado = 'bloqueado'
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND public._norm_nombre(nombre) IN (
    public._norm_nombre('Alberto Andrés Vergara Sánchez'),
    public._norm_nombre('Alvaro Moya Obregón')
  );

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE estado = 'activo')  AS activos,
  count(*) FILTER (WHERE estado <> 'activo') AS dados_de_baja,
  count(*) FILTER (WHERE estado = 'activo' AND NOT EXISTS (
    SELECT 1 FROM bloque_jugadores bj WHERE bj.jugador_id = jugadores.id
  ))                                          AS activos_sin_bloque
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (es_externo IS NULL OR es_externo = false);
