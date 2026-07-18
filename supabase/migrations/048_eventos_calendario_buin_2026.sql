-- Calendario Asociación Buin — Segundo semestre 2026
-- Limpia el rango antes de insertar (idempotente)
DELETE FROM eventos
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND fecha_inicio >= '2026-07-04'
  AND fecha_inicio <= '2026-12-20';

INSERT INTO eventos (club_id, titulo, tipo, fecha_inicio, descripcion) VALUES
  -- JULIO
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'DOBLES U19 SAN JOAQUÍN',                                    'torneo', '2026-07-04', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'PARTIDOS LIBRES – RECUPERATORIO FERIADO',                   'otro',   '2026-07-05', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', '2° INTERZONAL (LA REINA)',                                  'torneo', '2026-07-11', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', '2° INTERZONAL (LA REINA)',                                  'torneo', '2026-07-12', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ACTIVIDAD ONLINE PSICÓLOGO PADRE E HIJO',                  'otro',   '2026-07-18', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'CAMPEONATO ABIERTO – ACTIVIDAD PARA APOYAR IMPLEMENTACIÓN','torneo', '2026-07-19', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'LIGA EQUIPOS (SAN BERNARDO)',                              'torneo', '2026-07-25', '14:30–16:30 / 16:30–18:30 / 18:30–20:30 / 20:30–22:30'),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', '1ª FECHA LIGA EQUIPOS',                                    'torneo', '2026-07-26', NULL),

  -- AGOSTO
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ZONAL MENORES (SAN JOAQUÍN)',                              'torneo', '2026-08-01', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ZONAL MENORES (SAN JOAQUÍN)',                              'torneo', '2026-08-02', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'RANKING INTERNO SUB15, TCA Y TCB',                        'torneo', '2026-08-09', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL MASTER',                                         'torneo', '2026-08-15', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL MASTER / RANKING INTERNO SUB19 Y SUB13',         'torneo', '2026-08-16', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ZONAL TC (SAN JOAQUÍN)',                                  'torneo', '2026-08-29', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ZONAL TC',                                                'torneo', '2026-08-30', NULL),

  -- SEPTIEMBRE
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'ACTIVIDAD 18 SEPTIEMBRE – TODA ASOCIACIÓN – COMPLEJO FÁTIMA', 'otro', '2026-09-04', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'LIGA EQUIPOS MENORES (MACUL)',                             'torneo', '2026-09-05', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'RANKING INTERNO TCA Y TCB',                               'torneo', '2026-09-06', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'RANKING INTERNO SUB19, SUB15 Y SUB13',                    'torneo', '2026-09-13', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'GRAN ZONAL',                                              'torneo', '2026-09-26', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'SUPER LIGA RANKING – TODAS LAS CATEGORÍAS',               'torneo', '2026-09-27', NULL),

  -- OCTUBRE
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL MASTER',                                         'torneo', '2026-10-03', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL MASTER / RANKING INTERNO SUB19 Y SUB13',         'torneo', '2026-10-04', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'CAMPEONATO ABIERTO',                                      'torneo', '2026-10-10', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'TALLER RECREATIVO',                                       'otro',   '2026-10-11', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL PARALÍMPICO',                                    'torneo', '2026-10-17', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL PARALÍMPICO / RANKING INTERNO SUB15, TCA Y TCB', 'torneo', '2026-10-18', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'TALLER RECREATIVO',                                       'otro',   '2026-10-25', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'CAMPEONATO TELETÓN',                                      'torneo', '2026-10-31', NULL),

  -- NOVIEMBRE
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'TALLER RECREATIVO',                                       'otro',   '2026-11-01', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'RANKING INTERNO SUB19 Y SUB13',                           'torneo', '2026-11-08', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL DOBLES SUB19',                                   'torneo', '2026-11-13', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL SUB15 Y SUB19',                                  'torneo', '2026-11-14', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL SUB15 Y SUB19',                                  'torneo', '2026-11-15', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL SUB11 Y SUB13',                                  'torneo', '2026-11-21', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL SUB11 Y SUB13 / RANKING INTERNO SUB15, TCA Y TCB','torneo', '2026-11-22', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL EQUIPOS MENORES / CAMPEONATO ABIERTO',           'torneo', '2026-11-28', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL EQUIPOS MENORES',                                'torneo', '2026-11-29', NULL),

  -- DICIEMBRE
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL DOBLES TC',                                      'torneo', '2026-12-04', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL TC',                                             'torneo', '2026-12-05', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL TC',                                             'torneo', '2026-12-06', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL EQUIPOS TC / CAMPEONATO NAVIDEÑO',               'torneo', '2026-12-12', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'NACIONAL EQUIPOS TC',                                     'torneo', '2026-12-13', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'SELECTIVO TODO COMPETIDOR',                               'torneo', '2026-12-19', NULL),
  ('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', 'SELECTIVO TODO COMPETIDOR',                               'torneo', '2026-12-20', NULL);
