-- ────────────────────────────────────────────────────────────
-- Sube el cupo de los bloques de demostración de Spinhouse.
--
-- Este cambio afecta a: Spinhouse, y SOLO a sus datos de demostración.
--
-- El seed (migración 229) le puso cupo 8 a los diez bloques, pero repartió unos
-- 33 adultos en los cinco de las 19:00 con dos o tres días cada uno. Resultado:
-- los de Adultos quedaron entre 5 y 8 personas por sobre el cupo, sin un solo
-- lugar libre, y la pantalla de recuperación no tenía nada que ofrecerle a un
-- alumno de Adultos. Los de Menores, con 7 de 8, eran los únicos con espacio.
--
-- No es un error del cupo como concepto —el club a veces pasa de doce y prefiere
-- verlo avisado antes que no poder inscribir, y por eso el cupo nunca bloqueó—
-- sino un número mal elegido para los datos falsos.
--
-- Solo toca los bloques de Spinhouse. Si ya se cargaron los bloques reales del
-- club, esta migración les cambia el cupo: revisar antes de correrla.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('233_cupos_realistas_demo_spinhouse');

-- Adultos: hoy tienen entre 13 y 16 inscritos. Con 18 quedan dos o tres lugares
-- libres, que es lo que hace que la prueba de recuperación tenga sentido.
UPDATE bloques_horario
SET cupo_maximo = 18
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND hora_inicio = '19:00';

-- Menores: 7 de 8 está bien, pero con 10 el bloque no se llena al primer aviso.
UPDATE bloques_horario
SET cupo_maximo = 10
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
  AND hora_inicio = '17:00';

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
-- Ningún bloque debería quedar en negativo:
--
-- SELECT b.nombre, b.dia_semana, b.cupo_maximo,
--        count(bj.jugador_id) AS inscritos,
--        b.cupo_maximo - count(bj.jugador_id) AS libres
-- FROM bloques_horario b
-- LEFT JOIN bloque_jugadores bj
--   ON bj.bloque_id = b.id AND bj.vigente_hasta IS NULL
-- WHERE b.club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
-- GROUP BY b.id, b.nombre, b.dia_semana, b.cupo_maximo
-- ORDER BY b.hora_inicio, b.dia_semana;
