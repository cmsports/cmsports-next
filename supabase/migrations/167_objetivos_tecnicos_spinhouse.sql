-- Catálogo inicial de objetivos técnicos para el piloto Spinhouse.
-- Los objetivos son configurables desde la pantalla del módulo y no se borran:
-- se desactivan para conservar el historial.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('167_objetivos_tecnicos_spinhouse');

INSERT INTO tecnico_objetivos (
  club_id, codigo, nombre, descripcion, dimension, nivel, criterio
)
VALUES
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'SER-CONTROL',
    'Control del servicio',
    'Ejecutar el servicio con trayectoria y profundidad intencionales.',
    'servicio',
    'inicial',
    'Logra la zona objetivo en al menos 7 de 10 intentos.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'REST-COLOC',
    'Colocación del resto',
    'Responder el servicio con una colocación que limite el ataque rival.',
    'resto',
    'inicial',
    'Realiza 6 de 10 restos válidos con colocación intencional.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'DER-CONS',
    'Regularidad de derecho',
    'Mantener el derecho con técnica estable durante el peloteo.',
    'derecho',
    'inicial',
    'Completa 8 golpes válidos consecutivos.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'REV-CONS',
    'Regularidad de revés',
    'Mantener el revés con control de dirección y altura.',
    'revés',
    'inicial',
    'Completa 8 golpes válidos consecutivos.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'BLQ-TIEMPO',
    'Tiempo de bloqueo',
    'Contactar la pelota delante del cuerpo y devolverla con control.',
    'bloqueo',
    'intermedio',
    'Registra 7 de 10 bloqueos controlados.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'DESP-REC',
    'Recuperación de posición',
    'Volver a una posición preparada después de cada golpe.',
    'desplazamiento',
    'intermedio',
    'Mantiene la posición preparada en 8 de 10 secuencias observadas.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'ATAQ-TRANS',
    'Transición a ataque',
    'Reconocer la oportunidad y pasar de control a ataque.',
    'táctica',
    'intermedio',
    'Identifica y ejecuta correctamente 6 de 10 oportunidades.'
  ),
  (
    '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',
    'PRES-RUTINA',
    'Rutina bajo presión',
    'Mantener la decisión técnica en puntos o ejercicios con presión.',
    'mental',
    'avanzado',
    'Mantiene la decisión acordada en 7 de 10 situaciones.'
  )
ON CONFLICT (club_id, codigo) DO NOTHING;

COMMIT;
