-- Zonal REAL desde DesarrolloTorneo 2da Fecha Individual Sub19 MET2 2026.xlsx
-- Club Juez MET2 Costa. NO toca Buin. Idempotente (borra solo este campeonato / MET2-20).
-- NO es migración: no usa _migracion_nueva. Pegar entero en SQL Editor de Supabase.
-- App: Juez MET2 Costa → Torneo oficial → 2do ZONAL INDIVIDUAL MET2 Costa
-- Vivo: /torneo-oficial/vivo/MET2-20
-- 319 inscritos, 8 eventos, grupos del Excel, mural Prog sáb/dom, pre-llave Juv V, llaves sáb.
-- Domingo Inf/Pinf: grupos + mural; las hojas KO del Excel vienen vacías.

BEGIN;

DO $$
DECLARE
  v_club uuid := '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430';
  v_camp uuid;
  v_JuvV uuid;
  v_JuvD uuid;
  v_PenV uuid;
  v_PenD uuid;
  v_InfV uuid;
  v_PinfV uuid;
  v_InfD uuid;
  v_PinfD uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club) THEN
    RAISE EXCEPTION 'Club juez MET2 Costa no encontrado. Pegá 194 primero.';
  END IF;

  DELETE FROM oficial_campeonatos
  WHERE club_id = v_club
    AND (
      nombre IN ('2do ZONAL INDIVIDUAL MET2 Costa', '2da Fecha Individual Sub19 MET2 2026')
      OR codigo_publico IN ('MET2-20', 'MET2-01')
    );

  INSERT INTO oficial_campeonatos (
    club_id, nombre, sede, zona, fecha_inicio, fecha_fin, estado,
    mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio, codigo_publico, notas
  ) VALUES (
    v_club, '2do ZONAL INDIVIDUAL MET2 Costa',
    'Centro Deportivo Mi Club La Reina',
    'Metropolitana 2 - Costa',
    '2026-06-20', '2026-06-21', 'en_curso',
    12, 25, 70, '09:00:00', 'MET2-20',
    'Importado del Excel Koidan (grupos, mural sáb/dom, pre-llave Juv V, llaves Juv/Pen).'
  ) RETURNING id INTO v_camp;

  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Juv V', 'Juvenil', 'varones',
    'bo5', 'llaves', 'en_curso', 2, '2026-06-20', 64
  ) RETURNING id INTO v_JuvV; -- 112 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Juv D', 'Juvenil', 'damas',
    'bo5', 'llaves', 'en_curso', 2, '2026-06-20', 16
  ) RETURNING id INTO v_JuvD; -- 25 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Pen V', 'Peneca', 'varones',
    'bo5', 'llaves', 'en_curso', 2, '2026-06-20', 16
  ) RETURNING id INTO v_PenV; -- 21 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Pen D', 'Peneca', 'damas',
    'bo5', 'llaves', 'en_curso', 2, '2026-06-20', 16
  ) RETURNING id INTO v_PenD; -- 15 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Inf V', 'Infantil', 'varones',
    'bo5', 'grupos', 'en_curso', 2, '2026-06-21', 64
  ) RETURNING id INTO v_InfV; -- 70 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Pinf V', 'Preinfantil', 'varones',
    'bo5', 'grupos', 'en_curso', 2, '2026-06-21', 32
  ) RETURNING id INTO v_PinfV; -- 43 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Inf D', 'Preinfantil', 'damas',
    'bo5', 'grupos', 'en_curso', 2, '2026-06-21', 16
  ) RETURNING id INTO v_InfD; -- 17 inscritos
  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Pinf D', 'Infantil', 'damas',
    'bo5', 'grupos', 'en_curso', 2, '2026-06-21', 16
  ) RETURNING id INTO v_PinfD; -- 16 inscritos

  INSERT INTO oficial_inscritos (
    club_id, evento_id, nombre, asociacion, codigo_federativo, genero, ranking, cabeza_numero, orden_inscripcion
  ) VALUES
    (v_club, v_JuvV, 'CAMPOS, Julian', 'SMG', '601', 'V', 601, 1, 1),
    (v_club, v_JuvV, 'GONZALEZ, Agustín', 'CRD', '602', 'V', 602, NULL, 2),
    (v_club, v_JuvV, 'STECHER, Joaquin', 'SR', '603', 'V', 603, NULL, 3),
    (v_club, v_JuvV, 'PEREA, Mariano', 'MAC', '604', 'V', 604, 2, 4),
    (v_club, v_JuvV, 'OSSA, Andres', 'VLP', '605', 'V', 605, NULL, 5),
    (v_club, v_JuvV, 'URRIOLA, Fernando', 'BUI', '606', 'V', 606, NULL, 6),
    (v_club, v_JuvV, 'CERDA, Gustavo', 'MAC', '607', 'V', 607, 3, 7),
    (v_club, v_JuvV, 'DU ZOU, Matias', 'SR', '608', 'V', 608, NULL, 8),
    (v_club, v_JuvV, 'SINCHICAY, Piero', 'VLP', '609', 'V', 609, NULL, 9),
    (v_club, v_JuvV, 'VELASQUEZ, Ian', 'VLP', '610', 'V', 610, 4, 10),
    (v_club, v_JuvV, 'RODRÍGUEZ, Javier', 'SMG', '611', 'V', 611, NULL, 11),
    (v_club, v_JuvV, 'SANCHEZ, Germán', 'SJ', '612', 'V', 612, NULL, 12),
    (v_club, v_JuvV, 'REHREN, Adolfo', 'VLP', '613', 'V', 613, 5, 13),
    (v_club, v_JuvV, 'PONCE, Bruno', 'MAC', '614', 'V', 614, NULL, 14),
    (v_club, v_JuvV, 'ROMERO, Leonardo', 'CRD', '615', 'V', 615, NULL, 15),
    (v_club, v_JuvV, 'TOBAR, Axel', 'MAC', '616', 'V', 616, 6, 16),
    (v_club, v_JuvV, 'SAN MARTIN, Lucas', 'SMG', '617', 'V', 617, NULL, 17),
    (v_club, v_JuvV, 'BARRIOS, Tomas', 'SR', '618', 'V', 618, NULL, 18),
    (v_club, v_JuvV, 'CATALÁN, Jesús', 'MAC', '619', 'V', 619, 7, 19),
    (v_club, v_JuvV, 'GÓMEZ, Lucas', 'VLP', '620', 'V', 620, NULL, 20),
    (v_club, v_JuvV, 'OLMEDO, Tomas', 'SR', '621', 'V', 621, NULL, 21),
    (v_club, v_JuvV, 'OSSA, Joaquin', 'VLP', '625', 'V', 625, 8, 22),
    (v_club, v_JuvV, 'VÁSQUEZ, Óscar', 'MAC', '626', 'V', 626, NULL, 23),
    (v_club, v_JuvV, 'VALDERRAMA, Bastian', 'SJ', '627', 'V', 627, NULL, 24),
    (v_club, v_JuvV, 'BURGOS, Juan', 'MAC', '622', 'V', 622, 9, 25),
    (v_club, v_JuvV, 'AYALA, Diego', 'VLP', '623', 'V', 623, NULL, 26),
    (v_club, v_JuvV, 'GIROZ, Bastian', 'SJ', '624', 'V', 624, NULL, 27),
    (v_club, v_JuvV, 'CAMUSET, Lukas', 'MAC', '628', 'V', 628, 10, 28),
    (v_club, v_JuvV, 'SOTO, Martin', 'VLP', '629', 'V', 629, NULL, 29),
    (v_club, v_JuvV, 'ARROYO, Luis', 'SMG', '630', 'V', 630, NULL, 30),
    (v_club, v_JuvV, 'TANNOUX, Pierre', 'SMG', '631', 'V', 631, 11, 31),
    (v_club, v_JuvV, 'CEBALLOS, Renato', 'SR', '632', 'V', 632, NULL, 32),
    (v_club, v_JuvV, 'SALAZAR, Benjamín', 'CRD', '633', 'V', 633, NULL, 33),
    (v_club, v_JuvV, 'GARCIA, Fernando', 'VLP', '634', 'V', 634, 12, 34),
    (v_club, v_JuvV, 'BASTÍAS, Mateo', 'CRD', '635', 'V', 635, NULL, 35),
    (v_club, v_JuvV, 'MORALES, Martin', 'BUI', '636', 'V', 636, NULL, 36),
    (v_club, v_JuvV, 'CEBALLOS, Tomas', 'BUI', '637', 'V', 637, 13, 37),
    (v_club, v_JuvV, 'ABURTO, Salvador', 'PÑL', '638', 'V', 638, NULL, 38),
    (v_club, v_JuvV, 'MORALES, Benjamin', 'CRD', '639', 'V', 639, NULL, 39),
    (v_club, v_JuvV, 'SOLIS, Matias', 'VLP', '640', 'V', 640, 14, 40),
    (v_club, v_JuvV, 'CARTER, Cristobal', 'PÑL', '641', 'V', 641, NULL, 41),
    (v_club, v_JuvV, 'GAETE, Benjamin', 'BUI', '642', 'V', 642, NULL, 42),
    (v_club, v_JuvV, 'TAIBA, Fabio', 'SJ', '643', 'V', 643, 15, 43),
    (v_club, v_JuvV, 'MUÑOZ, Matias', 'BUI', '644', 'V', 644, NULL, 44),
    (v_club, v_JuvV, 'VERA, Joaquín', 'PÑL', '645', 'V', 645, NULL, 45),
    (v_club, v_JuvV, 'SAAVEDRA, Tomas', 'SMG', '646', 'V', 646, 16, 46),
    (v_club, v_JuvV, 'FLORES, Gabriel', 'PÑL', '647', 'V', 647, NULL, 47),
    (v_club, v_JuvV, 'IMILQUEO, Alan', 'BUI', '648', 'V', 648, NULL, 48),
    (v_club, v_JuvV, 'MELINAO, Benjamín', 'PÑL', '649', 'V', 649, 17, 49),
    (v_club, v_JuvV, 'RODRÍGUEZ, Mariano', 'MAC', '650', 'V', 650, NULL, 50),
    (v_club, v_JuvV, 'QUINTEROS, Agustin', 'BUI', '651', 'V', 651, NULL, 51),
    (v_club, v_JuvV, 'ARAYA, Bruno', 'MAC', '652', 'V', 652, 18, 52),
    (v_club, v_JuvV, 'CUMINIQUIR, Diego', 'SJ', '653', 'V', 653, NULL, 53),
    (v_club, v_JuvV, 'BRITO, Benjamin', 'CRD', '654', 'V', 654, NULL, 54),
    (v_club, v_JuvV, 'ALCAINO, Ivan', 'SR', '655', 'V', 655, 19, 55),
    (v_club, v_JuvV, 'REYES, Gabriel', 'SMG', '656', 'V', 656, NULL, 56),
    (v_club, v_JuvV, 'CONTRERAS, Tomás', 'SJ', '657', 'V', 657, NULL, 57),
    (v_club, v_JuvV, 'VIVANCO, Josué', 'SJ', '658', 'V', 658, 20, 58),
    (v_club, v_JuvV, 'ESPINOZA, Dante', 'MAC', '659', 'V', 659, NULL, 59),
    (v_club, v_JuvV, 'LORCA, Benuat', 'SR', '660', 'V', 660, NULL, 60),
    (v_club, v_JuvV, 'CÁCERES, Augusto', 'PÑL', '661', 'V', 661, 21, 61),
    (v_club, v_JuvV, 'CHOMBA, Cristian', 'SMG', '662', 'V', 662, NULL, 62),
    (v_club, v_JuvV, 'LIZAMA, Joaquin', 'SR', '663', 'V', 663, NULL, 63),
    (v_club, v_JuvV, 'LUCO, Franco', 'PÑL', '664', 'V', 664, 22, 64),
    (v_club, v_JuvV, 'HIDALGO, Vicente', 'SMG', '665', 'V', 665, NULL, 65),
    (v_club, v_JuvV, 'MÁRQUEZ, Simón', 'SJ', '666', 'V', 666, NULL, 66),
    (v_club, v_JuvV, 'ALMONACID, Amaro', 'SJ', '667', 'V', 667, 23, 67),
    (v_club, v_JuvV, 'HONORES, Ronal', 'VLP', '668', 'V', 668, NULL, 68),
    (v_club, v_JuvV, 'ALARCON, Matías', 'SMG', '669', 'V', 669, NULL, 69),
    (v_club, v_JuvV, 'TARBES, Alexander', 'CRD', '670', 'V', 670, 24, 70),
    (v_club, v_JuvV, 'MARTINEZ, Esteban', 'VLP', '671', 'V', 671, NULL, 71),
    (v_club, v_JuvV, 'PIÑEIRO, Vicente', 'MAC', '672', 'V', 672, NULL, 72),
    (v_club, v_JuvV, 'LOZA, Gaspar', 'SMG', '673', 'V', 673, 25, 73),
    (v_club, v_JuvV, 'ARANCIBIA, Eduardo', 'SR', '674', 'V', 674, NULL, 74),
    (v_club, v_JuvV, 'VERGARA, Alonso', 'MAC', '675', 'V', 675, NULL, 75),
    (v_club, v_JuvV, 'VALDERRAMA, Joaquín', 'BUI', '676', 'V', 676, 26, 76),
    (v_club, v_JuvV, 'ASCENCIO, Martín', 'SMG', '677', 'V', 677, NULL, 77),
    (v_club, v_JuvV, 'VEGA, Fernando', 'SJ', '678', 'V', 678, NULL, 78),
    (v_club, v_JuvV, 'MATTOS, Eliel', 'SMG', '679', 'V', 679, 27, 79),
    (v_club, v_JuvV, 'PÉREZ, Joaquín', 'SJ', '680', 'V', 680, NULL, 80),
    (v_club, v_JuvV, 'SEGUEL, Vicente', 'BUI', '681', 'V', 681, NULL, 81),
    (v_club, v_JuvV, 'GUAMAN, Benjamin', 'VLP', '682', 'V', 682, 28, 82),
    (v_club, v_JuvV, 'VILLAR, Aquiles', 'SJ', '683', 'V', 683, NULL, 83),
    (v_club, v_JuvV, 'MUÑOZ, Diego', 'SMG', '684', 'V', 684, NULL, 84),
    (v_club, v_JuvV, 'SOTO, Cristofer', 'SJ', '685', 'V', 685, 29, 85),
    (v_club, v_JuvV, 'CORONADO, Abraham', 'SR', '686', 'V', 686, NULL, 86),
    (v_club, v_JuvV, 'MONTALVAN, Ricardo', 'VLP', '687', 'V', 687, NULL, 87),
    (v_club, v_JuvV, 'ORDOÑEZ, Benjamin', 'MAC', '688', 'V', 688, 30, 88),
    (v_club, v_JuvV, 'SÁNCHEZ, Justin', 'SJ', '689', 'V', 689, NULL, 89),
    (v_club, v_JuvV, 'QUIROZ, Javier', 'SMG', '690', 'V', 690, NULL, 90),
    (v_club, v_JuvV, 'SALAZAR, Vicente', 'CRD', '691', 'V', 691, 31, 91),
    (v_club, v_JuvV, 'MORAGA, Maximiliano', 'SR', '692', 'V', 692, NULL, 92),
    (v_club, v_JuvV, 'PARREÑO, Jeremy', 'SJ', '693', 'V', 693, NULL, 93),
    (v_club, v_JuvV, 'TORRES, Iker', 'SJ', '694', 'V', 694, 32, 94),
    (v_club, v_JuvV, 'POBLETE, Gustavo', 'CRD', '695', 'V', 695, NULL, 95),
    (v_club, v_JuvV, 'JUAN, Bastian', 'SR', '696', 'V', 696, NULL, 96),
    (v_club, v_JuvV, 'IRARRÁZABAL, Bruno', 'MAC', '697', 'V', 697, 33, 97),
    (v_club, v_JuvV, 'SAAVEDRA, Juan', 'SJ', '698', 'V', 698, NULL, 98),
    (v_club, v_JuvV, 'GARCIA, Kevin', 'SR', '699', 'V', 699, NULL, 99),
    (v_club, v_JuvV, 'AMIGO, Renato', 'BUI', '700', 'V', 700, 34, 100),
    (v_club, v_JuvV, 'MARDONES, Ignacio', 'SJ', '701', 'V', 701, NULL, 101),
    (v_club, v_JuvV, 'MATURANA, Vicente', 'VLP', '702', 'V', 702, NULL, 102),
    (v_club, v_JuvV, 'REYES, Sebastian', 'PÑL', '703', 'V', 703, 35, 103),
    (v_club, v_JuvV, 'TAIBA, Bastian', 'SJ', '704', 'V', 704, NULL, 104),
    (v_club, v_JuvV, 'AGUILERA, Isaias', 'BUI', '705', 'V', 705, NULL, 105),
    (v_club, v_JuvV, 'GONZALES, Felipe', 'SJ', '706', 'V', 706, 36, 106),
    (v_club, v_JuvV, 'PASMIÑO, Diego', 'SR', '707', 'V', 707, NULL, 107),
    (v_club, v_JuvV, 'EVERT, Eduardo', 'SR', '708', 'V', 708, NULL, 108),
    (v_club, v_JuvV, 'MARCANO, Miguel', 'SJ', '709', 'V', 709, 37, 109),
    (v_club, v_JuvV, 'AGUILAR, Vicente', 'SR', '710', 'V', 710, NULL, 110),
    (v_club, v_JuvV, 'MONTANER, Benjamin', 'VLP', '711', 'V', 711, NULL, 111),
    (v_club, v_JuvV, 'GARCIA, Cristobal', 'BUI', '712', 'V', 712, NULL, 112),
    (v_club, v_JuvD, 'RÍOS, Martina', 'MAC', '501', 'D', 501, 1, 1),
    (v_club, v_JuvD, 'UGAS, Micaela', 'PÑL', '502', 'D', 502, NULL, 2),
    (v_club, v_JuvD, 'ARANCIBIA, Janine', 'VLP', '503', 'D', 503, NULL, 3),
    (v_club, v_JuvD, 'HERRERA, Yashiara', 'PÑL', '504', 'D', 504, 2, 4),
    (v_club, v_JuvD, 'ROMÁN, Javiera', 'MLP', '505', 'D', 505, NULL, 5),
    (v_club, v_JuvD, 'LEMUÑIR, Anyelen', 'SJ', '506', 'D', 506, NULL, 6),
    (v_club, v_JuvD, 'MARTINEZ, Sofia', 'SJ', '507', 'D', 507, 3, 7),
    (v_club, v_JuvD, 'SOTO, Agustina', 'BUI', '508', 'D', 508, NULL, 8),
    (v_club, v_JuvD, 'ROMERO, Antonella', 'MLP', '509', 'D', 509, NULL, 9),
    (v_club, v_JuvD, 'FIGUEROA, Francisca', 'SR', '510', 'D', 510, 4, 10),
    (v_club, v_JuvD, 'MORA, Anais', 'CRD', '511', 'D', 511, NULL, 11),
    (v_club, v_JuvD, 'BONO, Amelie', 'VLP', '512', 'D', 512, NULL, 12),
    (v_club, v_JuvD, 'QUIROZ, Fernanda', 'MAC', '513', 'D', 513, 5, 13),
    (v_club, v_JuvD, 'MUÑOZ, Sofia', 'SJ', '514', 'D', 514, NULL, 14),
    (v_club, v_JuvD, 'ÑANCULAO, Fernanda', 'SMG', '515', 'D', 515, NULL, 15),
    (v_club, v_JuvD, 'DIAZ, Valentina', 'SMG', '516', 'D', 516, 6, 16),
    (v_club, v_JuvD, 'PEÑA, Fernanda', 'SR', '517', 'D', 517, NULL, 17),
    (v_club, v_JuvD, 'ESPINOLA, Javiera', 'CRD', '518', 'D', 518, NULL, 18),
    (v_club, v_JuvD, 'VARGAS, Letizia', 'SMG', '519', 'D', 519, 7, 19),
    (v_club, v_JuvD, 'REYES, Pia', 'SJ', '520', 'D', 520, NULL, 20),
    (v_club, v_JuvD, 'VENEGAS, Amelia', 'VLP', '521', 'D', 521, NULL, 21),
    (v_club, v_JuvD, 'CASTRO, Pia', 'VLP', '522', 'D', 522, 8, 22),
    (v_club, v_JuvD, 'MARTÍNEZ, Danae', 'MAC', '523', 'D', 523, NULL, 23),
    (v_club, v_JuvD, 'AGUAYO, Elisa', 'PÑL', '524', 'D', 524, NULL, 24),
    (v_club, v_JuvD, 'PÁEZ, Samantha', 'SMG', '525', 'D', 525, NULL, 25),
    (v_club, v_PenV, 'AGUILAR, Julian', 'MLP', '21', 'V', 21, 1, 1),
    (v_club, v_PenV, 'FIGUEIRA, Andres', 'SJ', '22', 'V', 22, NULL, 2),
    (v_club, v_PenV, 'TRONCOSO, Matías', 'SMG', '23', 'V', 23, NULL, 3),
    (v_club, v_PenV, 'REYES, Agustín', 'SJ', '24', 'V', 24, 2, 4),
    (v_club, v_PenV, 'VERA, Vicente', 'MAC', '25', 'V', 25, NULL, 5),
    (v_club, v_PenV, 'ALISTE, Gaspar', 'SMG', '26', 'V', 26, NULL, 6),
    (v_club, v_PenV, 'SILVA, Manuel', 'MAC', '27', 'V', 27, 3, 7),
    (v_club, v_PenV, 'PEÑA, Vicente', 'SR', '28', 'V', 28, NULL, 8),
    (v_club, v_PenV, 'ESPINOZA, Gabriel', 'CRD', '29', 'V', 29, NULL, 9),
    (v_club, v_PenV, 'REYES, Marcelo', 'MAC', '31', 'V', 31, 4, 10),
    (v_club, v_PenV, 'MAYNE, Fernando', 'VLP', '32', 'V', 32, NULL, 11),
    (v_club, v_PenV, 'HERRERA, Aydan', 'PÑL', '33', 'V', 33, NULL, 12),
    (v_club, v_PenV, 'LEIVA, Renato', 'CRD', '30', 'V', 30, 5, 13),
    (v_club, v_PenV, 'HOLLOWAY, Manuel', 'SR', '34', 'V', 34, NULL, 14),
    (v_club, v_PenV, 'VOS, Benito', 'MAC', '35', 'V', 35, NULL, 15),
    (v_club, v_PenV, 'DEL CAMPO, Dante', 'SJ', '36', 'V', 36, 6, 16),
    (v_club, v_PenV, 'ACEVEDO, Camilo', 'MLP', '37', 'V', 37, NULL, 17),
    (v_club, v_PenV, 'CISTERNAS, Joaquin', 'VLP', '38', 'V', 38, NULL, 18),
    (v_club, v_PenV, 'MONZÓN, Jesús', 'SJ', '39', 'V', 39, 7, 19),
    (v_club, v_PenV, 'TRONCOSO, Máximo', 'SMG', '40', 'V', 40, NULL, 20),
    (v_club, v_PenV, 'BASTIAS, Domingo', 'VLP', '41', 'V', 41, NULL, 21),
    (v_club, v_PenD, 'ORELLANA, Martina', 'MAC', '1', 'D', 1, 1, 1),
    (v_club, v_PenD, 'MARTINES, Celeste', 'VLP', '2', 'D', 2, NULL, 2),
    (v_club, v_PenD, 'CARIS, Noelia', 'SR', '3', 'D', 3, NULL, 3),
    (v_club, v_PenD, 'GALAZ, Martina', 'SJ', '4', 'D', 4, 2, 4),
    (v_club, v_PenD, 'SAAVEDRA, Florencia', 'VLP', '5', 'D', 5, NULL, 5),
    (v_club, v_PenD, 'MARTÍNEZ, Luciana', 'MAC', '6', 'D', 6, NULL, 6),
    (v_club, v_PenD, 'TUMAYAN, Julieta', 'MAC', '7', 'D', 7, 3, 7),
    (v_club, v_PenD, 'SANCLEMENTE, Nahara', 'PÑL', '8', 'D', 8, NULL, 8),
    (v_club, v_PenD, 'RANTUL, Ignacia', 'SR', '9', 'D', 9, NULL, 9),
    (v_club, v_PenD, 'PEÑA, Catalina', 'MLP', '10', 'D', 10, 4, 10),
    (v_club, v_PenD, 'REINUN, Alondra', 'MAC', '11', 'D', 11, NULL, 11),
    (v_club, v_PenD, 'FREDES, Martina', 'SJ', '12', 'D', 12, NULL, 12),
    (v_club, v_PenD, 'SANTIS, Dominga', 'MLP', '13', 'D', 13, 5, 13),
    (v_club, v_PenD, 'SILVA, Florencia', 'MAC', '14', 'D', 14, NULL, 14),
    (v_club, v_PenD, 'CORNEJO, Francisca', 'PÑL', '15', 'D', 15, NULL, 15),
    (v_club, v_InfV, 'GUERRERO, Benjamín', 'MAC', '141', 'V', 141, 1, 1),
    (v_club, v_InfV, 'LAGOS, Tomas', 'SR', '142', 'V', 142, NULL, 2),
    (v_club, v_InfV, 'FIGUEROA, Tomas', 'CRD', '143', 'V', 143, NULL, 3),
    (v_club, v_InfV, 'ACUÑA, Agustín', 'MAC', '144', 'V', 144, 2, 4),
    (v_club, v_InfV, 'MUÑOZ, Alonso', 'SR', '145', 'V', 145, NULL, 5),
    (v_club, v_InfV, 'CIEZA, Marlon', 'SJ', '146', 'V', 146, NULL, 6),
    (v_club, v_InfV, 'SILVA, Benjamin', 'SR', '147', 'V', 147, 3, 7),
    (v_club, v_InfV, 'CERDA, Samuel', 'MAC', '148', 'V', 148, NULL, 8),
    (v_club, v_InfV, 'HERRERA, Bastian', 'CRD', '149', 'V', 149, NULL, 9),
    (v_club, v_InfV, 'SOTO, Santiago', 'MAC', '150', 'V', 150, 4, 10),
    (v_club, v_InfV, 'ARAVENA, Williams', 'CRD', '151', 'V', 151, NULL, 11),
    (v_club, v_InfV, 'MARQUEZ, Luis', 'VLP', '152', 'V', 152, NULL, 12),
    (v_club, v_InfV, 'MORALES, Marcos', 'MAC', '153', 'V', 153, 5, 13),
    (v_club, v_InfV, 'BARBOZA, Camilo', 'VLP', '154', 'V', 154, NULL, 14),
    (v_club, v_InfV, 'CONCHA, Tomas', 'SJ', '155', 'V', 155, NULL, 15),
    (v_club, v_InfV, 'GIMENEZ, Luis', 'SR', '156', 'V', 156, 6, 16),
    (v_club, v_InfV, 'SANCHEZ, Simon', 'VLP', '157', 'V', 157, NULL, 17),
    (v_club, v_InfV, 'JARA, Felipe', 'SMG', '158', 'V', 158, NULL, 18),
    (v_club, v_InfV, 'CELIS, Odell', 'VLP', '159', 'V', 159, 7, 19),
    (v_club, v_InfV, 'LOPEZ, Ricardo', 'BUI', '160', 'V', 160, NULL, 20),
    (v_club, v_InfV, 'BLANCO, Martin', 'SR', '161', 'V', 161, NULL, 21),
    (v_club, v_InfV, 'URIBE, Franco', 'VLP', '162', 'V', 162, 8, 22),
    (v_club, v_InfV, 'MANSILLA, Cristobal', 'CRD', '163', 'V', 163, NULL, 23),
    (v_club, v_InfV, 'DARLAS, Sebastian', 'SMG', '164', 'V', 164, NULL, 24),
    (v_club, v_InfV, 'RODRIGUEZ, Joaquin', 'VLP', '165', 'V', 165, 9, 25),
    (v_club, v_InfV, 'ORELLANA, Tomás', 'PÑL', '166', 'V', 166, NULL, 26),
    (v_club, v_InfV, 'KETELS, Matías', 'CRD', '167', 'V', 167, NULL, 27),
    (v_club, v_InfV, 'CAMPOS, Domingo', 'SJ', '168', 'V', 168, 10, 28),
    (v_club, v_InfV, 'BARREZUETA, Santiago', 'PÑL', '169', 'V', 169, NULL, 29),
    (v_club, v_InfV, 'SANCHEZ, Jose', 'BUI', '170', 'V', 170, NULL, 30),
    (v_club, v_InfV, 'BENAVIDES, Matias', 'SJ', '171', 'V', 171, 11, 31),
    (v_club, v_InfV, 'GAJARDO, León', 'MAC', '172', 'V', 172, NULL, 32),
    (v_club, v_InfV, 'MUÑOZ, Vicente', 'CRD', '173', 'V', 173, NULL, 33),
    (v_club, v_InfV, 'CASTELLANO, Adolfo', 'MLP', '174', 'V', 174, 12, 34),
    (v_club, v_InfV, 'FERRER, Alonso', 'BUI', '175', 'V', 175, NULL, 35),
    (v_club, v_InfV, 'RUIZ, Tomas', 'SJ', '176', 'V', 176, NULL, 36),
    (v_club, v_InfV, 'CORREA, Vicente', 'SMG', '177', 'V', 177, 13, 37),
    (v_club, v_InfV, 'UBILLA, Agustín', 'SJ', '178', 'V', 178, NULL, 38),
    (v_club, v_InfV, 'GARCIA, Vicente', 'BUI', '179', 'V', 179, NULL, 39),
    (v_club, v_InfV, 'GONZALEZ, Bruno', 'SMG', '180', 'V', 180, 14, 40),
    (v_club, v_InfV, 'GUAJARDO, Santiago', 'MLP', '181', 'V', 181, NULL, 41),
    (v_club, v_InfV, 'ARANCIBIA, Andres', 'VLP', '182', 'V', 182, NULL, 42),
    (v_club, v_InfV, 'SALINAS, Matias', 'SJ', '183', 'V', 183, 15, 43),
    (v_club, v_InfV, 'ZUÑIGA, Gustavo', 'VLP', '184', 'V', 184, NULL, 44),
    (v_club, v_InfV, 'SEGUEL, Matias', 'SMG', '185', 'V', 185, NULL, 45),
    (v_club, v_InfV, 'VALENZUELA, Renato', 'VLP', '186', 'V', 186, 16, 46),
    (v_club, v_InfV, 'ORTIZ, Daniel', 'MLP', '187', 'V', 187, NULL, 47),
    (v_club, v_InfV, 'PARRA, Juan', 'BUI', '188', 'V', 188, NULL, 48),
    (v_club, v_InfV, 'GOMEZ, Facundo', 'BUI', '189', 'V', 189, 17, 49),
    (v_club, v_InfV, 'AGUIRRE, Cristobal', 'VLP', '190', 'V', 190, NULL, 50),
    (v_club, v_InfV, 'FIGUEIRA, Ramses', 'SJ', '191', 'V', 191, NULL, 51),
    (v_club, v_InfV, 'DURAN, Vicente', 'VLP', '192', 'V', 192, 18, 52),
    (v_club, v_InfV, 'MORENO, Lukas', 'SJ', '193', 'V', 193, NULL, 53),
    (v_club, v_InfV, 'VEGA, Jean', 'CRD', '194', 'V', 194, NULL, 54),
    (v_club, v_InfV, 'MUÑOZ, Benjamín', 'SMG', '195', 'V', 195, 19, 55),
    (v_club, v_InfV, 'GALAZ, Maximiliano', 'SJ', '196', 'V', 196, NULL, 56),
    (v_club, v_InfV, 'CARRASCO, Benjamin', 'VLP', '197', 'V', 197, NULL, 57),
    (v_club, v_InfV, 'CHAILAN, Simon', 'VLP', '198', 'V', 198, 20, 58),
    (v_club, v_InfV, 'ITURRIAGA, Marcelo', 'MAC', '199', 'V', 199, NULL, 59),
    (v_club, v_InfV, 'ZAVALA, Benjamín', 'SMG', '200', 'V', 200, NULL, 60),
    (v_club, v_InfV, 'GAETE, Jean', 'SMG', '201', 'V', 201, 21, 61),
    (v_club, v_InfV, 'AVILES, Amaro', 'CRD', '202', 'V', 202, NULL, 62),
    (v_club, v_InfV, 'VILLANUEVA, Pascal', 'PÑL', '203', 'V', 203, NULL, 63),
    (v_club, v_InfV, 'VARGAS, Matias', 'SR', '204', 'V', 204, 22, 64),
    (v_club, v_InfV, 'ZARATE, Victor', 'VLP', '205', 'V', 205, NULL, 65),
    (v_club, v_InfV, 'TORRES, Daniel', 'BUI', '206', 'V', 206, NULL, 66),
    (v_club, v_InfV, 'MELLA, Leonardo', 'VLP', '207', 'V', 207, 23, 67),
    (v_club, v_InfV, 'RODRIGUEZ, Raul', 'SJ', '208', 'V', 208, NULL, 68),
    (v_club, v_InfV, 'GODOY, Rodrigo', 'SR', '209', 'V', 209, NULL, 69),
    (v_club, v_InfV, 'ÁLVAREZ, Matías', 'MAC', '210', 'V', 210, NULL, 70),
    (v_club, v_PinfV, 'LEYTON, Nicolás', 'MAC', '71', 'V', 71, 1, 1),
    (v_club, v_PinfV, 'OLMEDO, Nicolas', 'SR', '72', 'V', 72, NULL, 2),
    (v_club, v_PinfV, 'MANSILLA, Christian', 'CRD', '73', 'V', 73, NULL, 3),
    (v_club, v_PinfV, 'TEJEDA, Vicente', 'MAC', '74', 'V', 74, 2, 4),
    (v_club, v_PinfV, 'CARMONA, Mauricio', 'SMG', '75', 'V', 75, NULL, 5),
    (v_club, v_PinfV, 'DEILA, Massimiliano', 'VLP', '76', 'V', 76, NULL, 6),
    (v_club, v_PinfV, 'MORALES, Vicente', 'PÑL', '77', 'V', 77, 3, 7),
    (v_club, v_PinfV, 'ZAPATA, Elias', 'SJ', '78', 'V', 78, NULL, 8),
    (v_club, v_PinfV, 'MORALES, Mateo', 'VLP', '79', 'V', 79, NULL, 9),
    (v_club, v_PinfV, 'CAMPOS, Tomás', 'SMG', '80', 'V', 80, 4, 10),
    (v_club, v_PinfV, 'GONZÁLEZ, Fernando', 'MAC', '81', 'V', 81, NULL, 11),
    (v_club, v_PinfV, 'SAEZ, Amaro', 'SJ', '82', 'V', 82, NULL, 12),
    (v_club, v_PinfV, 'PARDO, Luciano', 'PÑL', '83', 'V', 83, 5, 13),
    (v_club, v_PinfV, 'CARO, Benjamín', 'BUI', '84', 'V', 84, NULL, 14),
    (v_club, v_PinfV, 'HOLLOWAY, Pedro', 'SR', '85', 'V', 85, NULL, 15),
    (v_club, v_PinfV, 'JORQUERA, Luis', 'VLP', '86', 'V', 86, 6, 16),
    (v_club, v_PinfV, 'FERRADA, Maximiliano', 'SJ', '87', 'V', 87, NULL, 17),
    (v_club, v_PinfV, 'OROZCO, Thomas', 'SMG', '88', 'V', 88, NULL, 18),
    (v_club, v_PinfV, 'SANDOVAL, Julian', 'SR', '89', 'V', 89, 7, 19),
    (v_club, v_PinfV, 'ESPINOZA, Mateo', 'VLP', '90', 'V', 90, NULL, 20),
    (v_club, v_PinfV, 'VERDUGO, Miguel', 'CRD', '91', 'V', 91, NULL, 21),
    (v_club, v_PinfV, 'SILVA, David', 'MAC', '92', 'V', 92, 8, 22),
    (v_club, v_PinfV, 'AHUMADA, Gustavo', 'PÑL', '93', 'V', 93, NULL, 23),
    (v_club, v_PinfV, 'RIVERA, Agustin', 'SR', '94', 'V', 94, NULL, 24),
    (v_club, v_PinfV, 'GARCIA, Martin', 'SR', '95', 'V', 95, 9, 25),
    (v_club, v_PinfV, 'REYES, Tomás', 'MAC', '96', 'V', 96, NULL, 26),
    (v_club, v_PinfV, 'CORNEJO, Fernando', 'PÑL', '97', 'V', 97, NULL, 27),
    (v_club, v_PinfV, 'ALVAREZ, Pablo', 'VLP', '98', 'V', 98, 10, 28),
    (v_club, v_PinfV, 'STELA, Maximiliano', 'MAC', '99', 'V', 99, NULL, 29),
    (v_club, v_PinfV, 'ARCE, Alex', 'SR', '100', 'V', 100, NULL, 30),
    (v_club, v_PinfV, 'BERNAZAR, Amir', 'BUI', '101', 'V', 101, 11, 31),
    (v_club, v_PinfV, 'LAGOS, Mateo', 'SR', '102', 'V', 102, NULL, 32),
    (v_club, v_PinfV, 'PADILLA, Jeans', 'SJ', '103', 'V', 103, NULL, 33),
    (v_club, v_PinfV, 'AYALA, Máximo', 'MAC', '104', 'V', 104, 12, 34),
    (v_club, v_PinfV, 'YÁÑEZ, Cristóbal', 'PÑL', '105', 'V', 105, NULL, 35),
    (v_club, v_PinfV, 'LEMUÑIR, Camilo', 'SJ', '106', 'V', 106, NULL, 36),
    (v_club, v_PinfV, 'CALDERÓN, Agustín', 'BUI', '107', 'V', 107, 13, 37),
    (v_club, v_PinfV, 'ARRIAGADA, Mateo', 'MAC', '108', 'V', 108, NULL, 38),
    (v_club, v_PinfV, 'SIERRA, Eduardo', 'CRD', '109', 'V', 109, NULL, 39),
    (v_club, v_PinfV, 'SILVA, Nicolás', 'MAC', '110', 'V', 110, 14, 40),
    (v_club, v_PinfV, 'HERMOSILLA, Matias', 'SJ', '111', 'V', 111, NULL, 41),
    (v_club, v_PinfV, 'BASTIAS, Santiago', 'VLP', '112', 'V', 112, NULL, 42),
    (v_club, v_PinfV, 'LÓPEZ, Tomás', 'SMG', '113', 'V', 113, NULL, 43),
    (v_club, v_InfD, 'CEA, Fernanda', 'SMG', '51', 'D', 51, 1, 1),
    (v_club, v_InfD, 'MUÑOZ, Fernanda', 'SR', '52', 'D', 52, NULL, 2),
    (v_club, v_InfD, 'MANSILLA, Christina', 'CRD', '53', 'D', 53, NULL, 3),
    (v_club, v_InfD, 'GALLARDO, Magdalena', 'MAC', '54', 'D', 54, 2, 4),
    (v_club, v_InfD, 'TRONCOSO, Amanda', 'SMG', '55', 'D', 55, NULL, 5),
    (v_club, v_InfD, 'RÍOS, Antonia', 'SJ', '56', 'D', 56, NULL, 6),
    (v_club, v_InfD, 'BROCKWAY, Padme', 'PÑL', '57', 'D', 57, 3, 7),
    (v_club, v_InfD, 'ITURRA, Isadora', 'SMG', '58', 'D', 58, NULL, 8),
    (v_club, v_InfD, 'OYARCE, Simona', 'VLP', '59', 'D', 59, NULL, 9),
    (v_club, v_InfD, 'LOZA, Agustina', 'SMG', '60', 'D', 60, 4, 10),
    (v_club, v_InfD, 'MARTÍNEZ, Grace', 'MAC', '61', 'D', 61, NULL, 11),
    (v_club, v_InfD, 'CAVOUR, Agustina', 'VLP', '62', 'D', 62, NULL, 12),
    (v_club, v_InfD, 'AMIGO, Julieta', 'BUI', '63', 'D', 63, NULL, 13),
    (v_club, v_InfD, 'SEPÚLVEDA, Antonella', 'MAC', '64', 'D', 64, 5, 14),
    (v_club, v_InfD, 'ZARATE, Beatriz', 'VLP', '65', 'D', 65, NULL, 15),
    (v_club, v_InfD, 'SÁNCHEZ, Isidora', 'SJ', '66', 'D', 66, NULL, 16),
    (v_club, v_InfD, 'JOFRÉ, Rocío', 'SMG', '67', 'D', 67, NULL, 17),
    (v_club, v_PinfD, 'SERNA, Sheiris', 'PÑL', '121', 'D', 121, 1, 1),
    (v_club, v_PinfD, 'COLLAO, Isabella', 'VLP', '122', 'D', 122, NULL, 2),
    (v_club, v_PinfD, 'MAYNE, Loreto', 'VLP', '123', 'D', 123, NULL, 3),
    (v_club, v_PinfD, 'ESPINOZA, Isidora', 'VLP', '124', 'D', 124, 2, 4),
    (v_club, v_PinfD, 'FREDES, Antonia', 'SJ', '125', 'D', 125, NULL, 5),
    (v_club, v_PinfD, 'RIBE, Katherine', 'PÑL', '126', 'D', 126, NULL, 6),
    (v_club, v_PinfD, 'LLANCALAHUEN, Martina', 'MAC', '127', 'D', 127, 3, 7),
    (v_club, v_PinfD, 'GALLARDO, Ma. Paz', 'VLP', '128', 'D', 128, NULL, 8),
    (v_club, v_PinfD, 'JIMENEZ, Victoria', 'CRD', '129', 'D', 129, NULL, 9),
    (v_club, v_PinfD, 'DIAZ, Ma. Antonieta', 'VLP', '130', 'D', 130, 4, 10),
    (v_club, v_PinfD, 'GALDAMES, Sol', 'PÑL', '131', 'D', 131, NULL, 11),
    (v_club, v_PinfD, 'REYES, Monserrat', 'SJ', '132', 'D', 132, NULL, 12),
    (v_club, v_PinfD, 'PEÑALOZA, Magdalena', 'CRD', '133', 'D', 133, 5, 13),
    (v_club, v_PinfD, 'VALDERRAMA, Josefina', 'SJ', '134', 'D', 134, NULL, 14),
    (v_club, v_PinfD, 'ESPINOZA, Agustina', 'SR', '135', 'D', 135, NULL, 15),
    (v_club, v_PinfD, 'SALINAS, Sofia', 'VLP', '136', 'D', 136, NULL, 16);

  -- Grupos y miembros tal como en la hoja Players
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '6', 5);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '7', 6);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '8', 7);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '9', 8);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '10', 9);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '11', 10);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '12', 11);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '13', 12);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '14', 13);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '15', 14);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '16', 15);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '17', 16);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '18', 17);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '19', 18);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '20', 19);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '21', 20);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '22', 21);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '23', 22);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '24', 23);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '25', 24);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '26', 25);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '27', 26);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '28', 27);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '29', 28);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '30', 29);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '31', 30);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '32', 31);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '33', 32);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '34', 33);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '35', 34);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '36', 35);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvV, '37', 36);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '6', 5);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '7', 6);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_JuvD, '8', 7);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '6', 5);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenV, '7', 6);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenD, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenD, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenD, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenD, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PenD, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '6', 5);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '7', 6);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '8', 7);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '9', 8);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '10', 9);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '11', 10);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '12', 11);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '13', 12);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '14', 13);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '15', 14);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '16', 15);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '17', 16);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '18', 17);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '19', 18);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '20', 19);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '21', 20);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '22', 21);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfV, '23', 22);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '6', 5);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '7', 6);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '8', 7);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '9', 8);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '10', 9);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '11', 10);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '12', 11);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '13', 12);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfV, '14', 13);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfD, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfD, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfD, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfD, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_InfD, '5', 4);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfD, '1', 0);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfD, '2', 1);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfD, '3', 2);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfD, '4', 3);
  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
  VALUES (v_club, v_PinfD, '5', 4);

  INSERT INTO oficial_grupo_inscritos (club_id, grupo_id, inscrito_id, orden)
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '602' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '603' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '605' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '606' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '608' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '609' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '611' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '612' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '614' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '615' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '617' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '618' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '620' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '621' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '623' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '624' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '625' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '626' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '627' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '629' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '630' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '631' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '632' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '633' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '634' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '635' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '636' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '637' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '638' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '639' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '640' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '641' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '642' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '643' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '644' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '645' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '648' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '650' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '651' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '652' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '653' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '654' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '655' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '656' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '657' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '658' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '659' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '660' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '662' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '663' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '664' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '665' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '666' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '667' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '668' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '669' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '670' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '671' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '672' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '673' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '674' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '675' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '676' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '677' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '678' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '680' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '681' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '682' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '683' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '684' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '685' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '686' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '687' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '689' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '690' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '692' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '693' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '694' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '695' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '696' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '697' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '698' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '699' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '700' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '701' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '702' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '705' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '706' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '707' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '708' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '709' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '710' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '711' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '502' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '503' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '505' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '506' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '507' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '508' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '509' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '510' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '511' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '513' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '514' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '515' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '517' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '518' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '519' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '520' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '521' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '523' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '524' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '525' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '22' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '23' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '25' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '26' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '28' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '29' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '30' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '34' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '35' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '31' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '33' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '36' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '37' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '38' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '39' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '40' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '41' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '2' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '3' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '5' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '6' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '9' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '10' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '11' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '12' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '13' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '14' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '15' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '141' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '142' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '143' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '144' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '145' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '146' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '147' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '148' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '149' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '150' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '151' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '152' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '153' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '154' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '155' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '156' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '157' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '158' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '159' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '160' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '161' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '162' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '163' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '164' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '165' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '166' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '167' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '168' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '169' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '170' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '171' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '172' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '173' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '174' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '175' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '176' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '177' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '178' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '179' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '180' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '181' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '182' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '183' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '184' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '185' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '186' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '187' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '188' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '189' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '190' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '191' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '192' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '193' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '194' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '195' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '196' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '197' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '198' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '199' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '200' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '201' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '202' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '203' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '204' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '205' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '206' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '207' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '208' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '209' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '210' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '71' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '72' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '73' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '74' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '75' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '76' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '77' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '78' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '79' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '80' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '81' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '82' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '83' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '84' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '85' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '86' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '87' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '88' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '89' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '90' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '91' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '92' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '93' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '94' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '95' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '96' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '97' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '98' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '99' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '100' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '101' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '102' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '103' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '104' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '105' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '106' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '107' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '108' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '109' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '110' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '111' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '112' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '113' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '51' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '52' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '53' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '54' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '55' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '56' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '57' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '58' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '59' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '60' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '61' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '62' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '63' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '64' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '65' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '66' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '67' LIMIT 1), 3),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '121' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '122' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '123' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '124' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '125' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '126' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '127' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '128' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '129' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '130' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '131' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '132' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '133' LIMIT 1), 0),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '134' LIMIT 1), 1),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '135' LIMIT 1), 2),
    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '136' LIMIT 1), 3);

  -- Partidos de grupo, orden ITTF
  INSERT INTO oficial_partidos (club_id, evento_id, grupo_id, fase, orden, inscrito_a_id, inscrito_b_id)
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '603' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '602' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '602' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '603' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '606' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '605' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '605' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '606' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '609' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '608' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '608' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '609' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '612' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '611' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '611' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '612' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '615' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '614' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '614' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '615' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '618' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '617' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '6'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '617' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '618' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '621' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '620' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '7'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '620' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '621' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '624' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '623' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '9'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '623' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '624' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '625' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '627' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '625' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '626' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '8'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '626' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '627' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '630' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '629' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '10'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '629' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '630' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '631' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '633' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '631' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '632' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '11'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '632' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '633' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '634' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '636' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '634' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '635' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '12'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '635' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '636' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '637' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '639' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '637' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '638' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '13'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '638' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '639' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '640' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '642' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '640' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '641' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '14'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '641' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '642' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '643' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '645' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '643' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '644' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '15'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '644' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '645' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '648' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '16'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '648' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '651' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '650' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '17'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '650' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '651' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '652' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '654' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '652' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '653' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '18'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '653' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '654' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '655' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '657' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '655' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '656' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '19'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '656' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '657' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '658' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '660' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '658' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '659' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '20'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '659' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '660' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '663' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '662' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '21'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '662' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '663' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '664' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '666' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '664' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '665' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '22'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '665' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '666' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '667' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '669' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '667' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '668' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '23'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '668' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '669' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '670' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '672' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '670' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '671' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '24'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '671' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '672' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '673' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '675' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '673' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '674' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '25'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '674' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '675' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '676' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '678' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '676' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '677' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '26'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '677' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '678' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '681' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '680' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '27'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '680' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '681' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '682' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '684' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '682' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '683' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '28'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '683' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '684' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '685' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '687' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '685' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '686' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '29'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '686' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '687' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '690' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '689' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '30'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '689' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '690' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '693' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '692' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '31'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '692' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '693' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '694' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '696' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '694' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '695' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '32'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '695' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '696' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '697' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '699' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '697' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '698' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '33'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '698' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '699' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '700' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '702' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '700' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '701' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '34'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '701' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '702' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '705' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '35'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '705' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '706' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '708' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '706' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '707' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '36'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '707' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '708' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '709' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '711' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '710' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '709' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '710' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '711' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '709' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1)),
    (v_club, v_JuvV, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvV AND nombre = '37'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '710' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '711' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '503' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '502' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '502' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '503' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '506' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '505' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '505' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '506' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '507' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '509' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '507' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '508' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '508' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '509' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '510' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '510' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '511' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '511' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '513' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '515' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '513' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '514' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '514' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '515' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '518' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '517' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '6'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '517' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '518' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '519' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '521' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '519' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '520' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '7'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '520' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '521' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '524' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '523' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '525' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '523' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '524' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '525' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '525' LIMIT 1)),
    (v_club, v_JuvD, (SELECT id FROM oficial_grupos WHERE evento_id = v_JuvD AND nombre = '8'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '523' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '524' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '23' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '22' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '22' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '23' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '26' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '25' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '25' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '26' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '29' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '28' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '28' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '29' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '30' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '35' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '30' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '34' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '34' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '35' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '31' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '33' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '31' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '33' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '36' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '38' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '36' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '37' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '6'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '37' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '38' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '39' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '41' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '39' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '40' LIMIT 1)),
    (v_club, v_PenV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenV AND nombre = '7'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '40' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '41' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '3' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '2' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '2' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '3' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '6' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '5' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '5' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '6' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '9' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '9' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '10' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '12' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '10' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '11' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '11' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '12' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '13' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '15' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '13' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '14' LIMIT 1)),
    (v_club, v_PenD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PenD AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '14' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '15' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '141' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '143' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '141' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '142' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '142' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '143' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '144' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '146' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '144' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '145' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '145' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '146' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '147' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '149' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '147' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '148' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '148' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '149' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '150' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '152' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '150' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '151' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '151' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '152' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '153' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '155' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '153' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '154' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '154' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '155' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '156' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '158' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '156' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '157' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '6'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '157' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '158' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '159' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '161' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '159' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '160' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '7'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '160' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '161' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '162' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '164' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '162' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '163' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '8'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '163' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '164' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '165' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '167' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '165' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '166' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '9'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '166' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '167' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '168' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '170' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '168' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '169' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '10'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '169' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '170' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '171' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '173' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '171' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '172' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '11'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '172' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '173' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '174' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '176' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '174' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '175' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '12'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '175' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '176' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '177' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '179' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '177' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '178' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '13'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '178' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '179' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '180' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '182' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '180' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '181' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '14'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '181' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '182' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '183' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '185' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '183' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '184' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '15'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '184' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '185' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '186' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '188' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '186' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '187' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '16'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '187' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '188' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '189' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '191' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '189' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '190' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '17'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '190' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '191' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '192' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '194' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '192' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '193' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '18'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '193' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '194' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '195' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '197' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '195' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '196' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '19'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '196' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '197' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '198' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '200' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '198' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '199' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '20'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '199' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '200' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '201' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '203' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '201' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '202' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '21'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '202' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '203' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '204' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '206' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '204' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '205' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '22'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '205' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '206' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '207' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '209' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '208' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '210' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '207' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '208' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '209' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '210' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '207' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '210' LIMIT 1)),
    (v_club, v_InfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfV AND nombre = '23'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '208' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfV AND codigo_federativo = '209' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '71' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '73' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '71' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '72' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '72' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '73' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '74' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '76' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '74' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '75' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '75' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '76' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '77' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '79' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '77' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '78' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '78' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '79' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '80' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '82' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '80' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '81' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '81' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '82' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '83' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '85' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '83' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '84' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '84' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '85' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '86' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '88' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '86' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '87' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '6'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '87' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '88' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '89' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '91' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '89' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '90' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '7'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '90' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '91' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '92' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '94' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '92' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '93' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '8'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '93' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '94' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '95' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '97' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '95' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '96' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '9'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '96' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '97' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '98' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '100' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '98' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '99' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '10'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '99' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '100' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '101' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '103' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '101' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '102' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '11'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '102' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '103' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '104' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '106' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '104' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '105' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '12'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '105' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '106' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '107' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '109' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '107' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '108' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '13'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '108' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '109' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '110' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '112' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '111' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '113' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '110' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '111' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '112' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '113' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '110' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '113' LIMIT 1)),
    (v_club, v_PinfV, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfV AND nombre = '14'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '111' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfV AND codigo_federativo = '112' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '51' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '53' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '51' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '52' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '52' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '53' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '54' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '56' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '54' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '55' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '55' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '56' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '57' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '59' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '57' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '58' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '58' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '59' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '60' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '62' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '61' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '63' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '60' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '61' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '62' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '63' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '60' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '63' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '4'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '61' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '62' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '64' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '66' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '65' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '67' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '64' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '65' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '66' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '67' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '64' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '67' LIMIT 1)),
    (v_club, v_InfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_InfD AND nombre = '5'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '65' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_InfD AND codigo_federativo = '66' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '121' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '123' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '121' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '122' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '1'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '122' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '123' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '124' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '126' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '124' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '125' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '2'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '125' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '126' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '127' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '129' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '127' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '128' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '3'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '128' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '129' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '130' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '132' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '130' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '131' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '4'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '131' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '132' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 0, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '133' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '135' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '134' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '136' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '133' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '134' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '135' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '136' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '133' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '136' LIMIT 1)),
    (v_club, v_PinfD, (SELECT id FROM oficial_grupos WHERE evento_id = v_PinfD AND nombre = '5'), 'grupos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '134' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PinfD AND codigo_federativo = '135' LIMIT 1));

  -- Mural grupos: hora × mesa del Prog (grupo de 4 = dos bloques)
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '6' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '7' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '8' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '9' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '11' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '12' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-20 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '13' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '14' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '15' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '16' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '17' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '18' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '19' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '20' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '21' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '22' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '23' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '24' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-20 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '25' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '26' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '27' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '28' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '29' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '30' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '31' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '32' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '33' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '34' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '35' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '37' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-20 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '37' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '36' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvV AND g.nombre = '10' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '6' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '7' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '8' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_JuvD AND g.nombre = '8' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-20 12:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '6' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenV AND g.nombre = '7' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenD AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenD AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenD AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenD AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-20 13:40'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PenD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '6' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '7' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '8' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '9' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '10' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '11' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-21 09:00'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '12' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '13' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '14' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '15' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '16' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '17' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '18' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '19' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '20' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '21' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '22' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '23' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-21 10:10'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfV AND g.nombre = '23' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '6' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '7' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '8' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '9' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '10' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '11' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-21 11:20'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '12' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '13' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '14' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfV AND g.nombre = '14' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 5, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 6, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 7, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 8, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 9, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_InfD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 10, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '1' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 11, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '2' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 12, programado_en = ('2026-06-21 12:25'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '3' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 1, programado_en = ('2026-06-21 13:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 2, programado_en = ('2026-06-21 13:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '4' AND p.fase = 'grupos' AND p.orden >= 3;
  UPDATE oficial_partidos p SET mesa = 3, programado_en = ('2026-06-21 13:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden < 3;
  UPDATE oficial_partidos p SET mesa = 4, programado_en = ('2026-06-21 13:30'::timestamp AT TIME ZONE 'America/Santiago')
  FROM oficial_grupos g
  WHERE p.grupo_id = g.id AND g.evento_id = v_PinfD AND g.nombre = '5' AND p.fase = 'grupos' AND p.orden >= 3;

  INSERT INTO oficial_bloques_especiales (club_id, campeonato_id, fecha, hora, duracion_min, tipo, etiqueta) VALUES
    (v_club, v_camp, '2026-06-20', '08:30', 30, 'apertura', 'Apertura y calentamiento'),
    (v_club, v_camp, '2026-06-20', '14:40', 40, 'receso', 'Receso'),
    (v_club, v_camp, '2026-06-20', '19:50', 40, 'premiacion', 'TÉRMINO Y PREMIACIÓN JUVENIL'),
    (v_club, v_camp, '2026-06-21', '08:30', 30, 'apertura', 'Apertura y calentamiento'),
    (v_club, v_camp, '2026-06-21', '14:30', 40, 'receso', 'Receso'),
    (v_club, v_camp, '2026-06-21', '19:40', 40, 'premiacion', 'TÉRMINO Y PREMIACIÓN');

  -- Pre-llave Juv V (hoja Pre llave)
  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, avance_origen_orden)
    (v_club, v_JuvV, 'avance', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '698' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '651' LIMIT 1), 1),
    (v_club, v_JuvV, 'avance', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '708' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), 2),
    (v_club, v_JuvV, 'avance', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '680' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '617' LIMIT 1), 3),
    (v_club, v_JuvV, 'avance', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '621' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '605' LIMIT 1), 4),
    (v_club, v_JuvV, 'avance', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '689' LIMIT 1), 5),
    (v_club, v_JuvV, 'avance', 6, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '701' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1), 6),
    (v_club, v_JuvV, 'avance', 7, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '630' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '653' LIMIT 1), 7),
    (v_club, v_JuvV, 'avance', 8, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '623' LIMIT 1), 8),
    (v_club, v_JuvV, 'avance', 9, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '635' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '662' LIMIT 1), 9),
    (v_club, v_JuvV, 'avance', 10, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '659' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '671' LIMIT 1), 10);

  -- Llaves Juv V (JUV V)
  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, mesa)
    (v_club, v_JuvV, '32vos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '612' LIMIT 1), 11),
    (v_club, v_JuvV, '32vos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '702' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '655' LIMIT 1), 12),
    (v_club, v_JuvV, '32vos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '658' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '651' LIMIT 1), 7),
    (v_club, v_JuvV, '32vos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '631' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), 4),
    (v_club, v_JuvV, '32vos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '634' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '665' LIMIT 1), 8),
    (v_club, v_JuvV, '32vos', 6, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '670' LIMIT 1), 1),
    (v_club, v_JuvV, '32vos', 7, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '643' LIMIT 1), 10),
    (v_club, v_JuvV, '32vos', 8, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '667' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '626' LIMIT 1), 6),
    (v_club, v_JuvV, '32vos', 9, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '641' LIMIT 1), 11),
    (v_club, v_JuvV, '32vos', 10, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '680' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '673' LIMIT 1), 2),
    (v_club, v_JuvV, '32vos', 11, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '652' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '605' LIMIT 1), 5),
    (v_club, v_JuvV, '32vos', 12, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '637' LIMIT 1), 9),
    (v_club, v_JuvV, '32vos', 13, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '686' LIMIT 1), 3),
    (v_club, v_JuvV, '32vos', 14, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '682' LIMIT 1), 12),
    (v_club, v_JuvV, '32vos', 15, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '676' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '710' LIMIT 1), 11),
    (v_club, v_JuvV, '32vos', 16, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '696' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 8),
    (v_club, v_JuvV, '32vos', 17, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '675' LIMIT 1), 9),
    (v_club, v_JuvV, '32vos', 18, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '614' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '664' LIMIT 1), 3),
    (v_club, v_JuvV, '32vos', 19, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '712' LIMIT 1), 4),
    (v_club, v_JuvV, '32vos', 20, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '707' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '633' LIMIT 1), 10),
    (v_club, v_JuvV, '32vos', 21, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '644' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '609' LIMIT 1), 6),
    (v_club, v_JuvV, '32vos', 22, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '653' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), 8),
    (v_club, v_JuvV, '32vos', 23, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '668' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1), 2),
    (v_club, v_JuvV, '32vos', 24, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '656' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), 5),
    (v_club, v_JuvV, '32vos', 25, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '603' LIMIT 1), 12),
    (v_club, v_JuvV, '32vos', 26, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '625' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '694' LIMIT 1), 9),
    (v_club, v_JuvV, '32vos', 27, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '662' LIMIT 1), 11),
    (v_club, v_JuvV, '32vos', 28, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '697' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '640' LIMIT 1), 7),
    (v_club, v_JuvV, '32vos', 29, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '678' LIMIT 1), 3),
    (v_club, v_JuvV, '32vos', 30, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '671' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '692' LIMIT 1), 5),
    (v_club, v_JuvV, '32vos', 31, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '685' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '639' LIMIT 1), 4),
    (v_club, v_JuvV, '32vos', 32, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '683' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 1),
    (v_club, v_JuvV, '16vos', 33, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '655' LIMIT 1), 10),
    (v_club, v_JuvV, '16vos', 34, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '658' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), 12),
    (v_club, v_JuvV, '16vos', 35, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '634' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), 8),
    (v_club, v_JuvV, '16vos', 36, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '626' LIMIT 1), 6),
    (v_club, v_JuvV, '16vos', 37, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '673' LIMIT 1), 7),
    (v_club, v_JuvV, '16vos', 38, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '652' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), 5),
    (v_club, v_JuvV, '16vos', 39, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '691' LIMIT 1), 2),
    (v_club, v_JuvV, '16vos', 40, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '676' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 11),
    (v_club, v_JuvV, '16vos', 41, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '664' LIMIT 1), 3),
    (v_club, v_JuvV, '16vos', 42, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '633' LIMIT 1), 9),
    (v_club, v_JuvV, '16vos', 43, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '644' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), 1),
    (v_club, v_JuvV, '16vos', 44, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '704' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), 10),
    (v_club, v_JuvV, '16vos', 45, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '625' LIMIT 1), 4),
    (v_club, v_JuvV, '16vos', 46, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '640' LIMIT 1), 12),
    (v_club, v_JuvV, '16vos', 47, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '692' LIMIT 1), 9),
    (v_club, v_JuvV, '16vos', 48, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '685' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 5),
    (v_club, v_JuvV, '8vos', 49, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '628' LIMIT 1), 1),
    (v_club, v_JuvV, '8vos', 50, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '661' LIMIT 1), 11),
    (v_club, v_JuvV, '8vos', 51, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '613' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), 12),
    (v_club, v_JuvV, '8vos', 52, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '622' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 9),
    (v_club, v_JuvV, '8vos', 53, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '688' LIMIT 1), 2),
    (v_club, v_JuvV, '8vos', 54, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '679' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), 8),
    (v_club, v_JuvV, '8vos', 55, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '619' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), 3),
    (v_club, v_JuvV, '8vos', 56, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '646' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 5),
    (v_club, v_JuvV, 'cuartos', 57, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '647' LIMIT 1), 2),
    (v_club, v_JuvV, 'cuartos', 58, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '703' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 12),
    (v_club, v_JuvV, 'cuartos', 59, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '616' LIMIT 1), 10),
    (v_club, v_JuvV, 'cuartos', 60, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '649' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 4),
    (v_club, v_JuvV, 'semis', 61, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), 10),
    (v_club, v_JuvV, 'semis', 62, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), 4),
    (v_club, v_JuvV, 'tercer_lugar', 63, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '607' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '604' LIMIT 1), NULL),
    (v_club, v_JuvV, 'final', 64, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '601' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvV AND codigo_federativo = '610' LIMIT 1), NULL);

  -- Llaves Juv D (JUV D)
  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, mesa)
    (v_club, v_JuvD, '8vos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '514' LIMIT 1), 11),
    (v_club, v_JuvD, '8vos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '505' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '520' LIMIT 1), 2),
    (v_club, v_JuvD, '8vos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '509' LIMIT 1), 3),
    (v_club, v_JuvD, '8vos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '523' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '510' LIMIT 1), 7),
    (v_club, v_JuvD, '8vos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '507' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1), 8),
    (v_club, v_JuvD, '8vos', 6, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '502' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), 10),
    (v_club, v_JuvD, '8vos', 7, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '513' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '517' LIMIT 1), 6),
    (v_club, v_JuvD, '8vos', 8, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '519' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), 9),
    (v_club, v_JuvD, 'cuartos', 9, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '520' LIMIT 1), 7),
    (v_club, v_JuvD, 'cuartos', 10, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '510' LIMIT 1), 6),
    (v_club, v_JuvD, 'cuartos', 11, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '522' LIMIT 1), 4),
    (v_club, v_JuvD, 'cuartos', 12, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '517' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), 10),
    (v_club, v_JuvD, 'semis', 13, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), 9),
    (v_club, v_JuvD, 'semis', 14, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), 8),
    (v_club, v_JuvD, 'tercer_lugar', 15, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '516' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '512' LIMIT 1), 11),
    (v_club, v_JuvD, 'final', 16, (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '501' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_JuvD AND codigo_federativo = '504' LIMIT 1), 8);

  -- Llaves Pen V (PEN V)
  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, mesa)
    (v_club, v_PenV, '8vos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), NULL, NULL),
    (v_club, v_PenV, '8vos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '36' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '40' LIMIT 1), 2),
    (v_club, v_PenV, '8vos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '35' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '28' LIMIT 1), 4),
    (v_club, v_PenV, '8vos', 4, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '26' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), 12),
    (v_club, v_PenV, '8vos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '33' LIMIT 1), 11),
    (v_club, v_PenV, '8vos', 6, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '30' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '38' LIMIT 1), 3),
    (v_club, v_PenV, '8vos', 7, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '39' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '23' LIMIT 1), 5),
    (v_club, v_PenV, '8vos', 8, NULL, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), NULL),
    (v_club, v_PenV, 'cuartos', 9, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '40' LIMIT 1), 2),
    (v_club, v_PenV, 'cuartos', 10, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '35' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), 1),
    (v_club, v_PenV, 'cuartos', 11, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '30' LIMIT 1), 9),
    (v_club, v_PenV, 'cuartos', 12, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '23' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), 8),
    (v_club, v_PenV, 'semis', 13, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), 1),
    (v_club, v_PenV, 'semis', 14, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), 6),
    (v_club, v_PenV, 'tercer_lugar', 15, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '32' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '24' LIMIT 1), 9),
    (v_club, v_PenV, 'final', 16, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '21' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenV AND codigo_federativo = '27' LIMIT 1), 3);

  -- Llaves Pen D (PEN D)
  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, mesa)
    (v_club, v_PenD, '8vos', 1, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), NULL, NULL),
    (v_club, v_PenD, '8vos', 2, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '5' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '15' LIMIT 1), 7),
    (v_club, v_PenD, '8vos', 3, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), NULL, NULL),
    (v_club, v_PenD, '8vos', 4, NULL, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '10' LIMIT 1), NULL),
    (v_club, v_PenD, '8vos', 5, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), NULL, NULL),
    (v_club, v_PenD, '8vos', 6, NULL, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '13' LIMIT 1), NULL),
    (v_club, v_PenD, '8vos', 7, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '12' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '3' LIMIT 1), 10),
    (v_club, v_PenD, '8vos', 8, NULL, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), NULL),
    (v_club, v_PenD, 'cuartos', 9, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '15' LIMIT 1), 7),
    (v_club, v_PenD, 'cuartos', 10, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '10' LIMIT 1), 11),
    (v_club, v_PenD, 'cuartos', 11, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '13' LIMIT 1), 3),
    (v_club, v_PenD, 'cuartos', 12, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '3' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), 6),
    (v_club, v_PenD, 'semis', 13, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), 7),
    (v_club, v_PenD, 'semis', 14, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), 5),
    (v_club, v_PenD, 'tercer_lugar', 15, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '8' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '7' LIMIT 1), 5),
    (v_club, v_PenD, 'final', 16, (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '1' LIMIT 1), (SELECT id FROM oficial_inscritos WHERE evento_id = v_PenD AND codigo_federativo = '4' LIMIT 1), 9);

  -- Mural llaves: hora × mesa del Prog (solo cruce con los dos jugadores)
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 1;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 2;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 3;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 4;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 5;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 6;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 7;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 8;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 9;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'avance' AND orden = 10;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 1;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 15:20'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 2;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 3;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 4;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 5;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 6;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 7;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 8;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 9;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 10;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 11;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 12;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 13;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 15:25'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 14;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 15;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 16;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 17;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 18;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 19;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 20;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 21;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 22;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 23;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 24;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 25;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 15:50'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 26;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 27;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 28;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 29;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 30;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 31;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '32vos' AND orden = 32;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 33;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 34;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 35;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 36;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 37;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 16:15'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 38;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 39;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 40;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 41;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 42;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 43;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 44;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 45;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 46;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 47;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '16vos' AND orden = 48;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 49;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 50;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 51;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 52;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 53;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 54;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 55;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = '8vos' AND orden = 56;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'cuartos' AND orden = 57;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'cuartos' AND orden = 58;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'cuartos' AND orden = 59;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'cuartos' AND orden = 60;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'semis' AND orden = 61;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'semis' AND orden = 62;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'tercer_lugar' AND orden = 63;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvV AND fase = 'final' AND orden = 64;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 1;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 16:40'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 2;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 3;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 4;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 5;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 6;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 7;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = '8vos' AND orden = 8;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'cuartos' AND orden = 9;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'cuartos' AND orden = 10;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'cuartos' AND orden = 11;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'cuartos' AND orden = 12;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'semis' AND orden = 13;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'semis' AND orden = 14;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'tercer_lugar' AND orden = 15;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_JuvD AND fase = 'final' AND orden = 16;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 2;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 3;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 4;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 5;
  UPDATE oficial_partidos SET mesa = 11, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 6;
  UPDATE oficial_partidos SET mesa = 12, programado_en = ('2026-06-20 17:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = '8vos' AND orden = 7;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'cuartos' AND orden = 9;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'cuartos' AND orden = 10;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'cuartos' AND orden = 11;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'cuartos' AND orden = 12;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'semis' AND orden = 13;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'semis' AND orden = 14;
  UPDATE oficial_partidos SET mesa = 3, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'tercer_lugar' AND orden = 15;
  UPDATE oficial_partidos SET mesa = 4, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenV AND fase = 'final' AND orden = 16;
  UPDATE oficial_partidos SET mesa = 1, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = '8vos' AND orden = 2;
  UPDATE oficial_partidos SET mesa = 2, programado_en = ('2026-06-20 17:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = '8vos' AND orden = 7;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'cuartos' AND orden = 9;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'cuartos' AND orden = 10;
  UPDATE oficial_partidos SET mesa = 9, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'cuartos' AND orden = 11;
  UPDATE oficial_partidos SET mesa = 10, programado_en = ('2026-06-20 18:05'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'cuartos' AND orden = 12;
  UPDATE oficial_partidos SET mesa = 7, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'semis' AND orden = 13;
  UPDATE oficial_partidos SET mesa = 8, programado_en = ('2026-06-20 18:35'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'semis' AND orden = 14;
  UPDATE oficial_partidos SET mesa = 5, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'tercer_lugar' AND orden = 15;
  UPDATE oficial_partidos SET mesa = 6, programado_en = ('2026-06-20 19:10'::timestamp AT TIME ZONE 'America/Santiago')
  WHERE evento_id = v_PenD AND fase = 'final' AND orden = 16;

  -- Numeración ITTF del programa
  WITH ord AS (
    SELECT p.id, row_number() OVER (ORDER BY p.programado_en NULLS LAST, p.mesa NULLS LAST, p.fase, p.orden) AS n
    FROM oficial_partidos p
    JOIN oficial_eventos e ON e.id = p.evento_id
    WHERE e.campeonato_id = v_camp
  )
  UPDATE oficial_partidos p SET numero_ittf = ord.n FROM ord WHERE p.id = ord.id;

  RAISE NOTICE 'Listo campeonato % codigo MET2-20', v_camp;
END $$;

COMMIT;

SELECT c.nombre, c.codigo_publico,
  (SELECT count(*) FROM oficial_eventos e WHERE e.campeonato_id = c.id) AS eventos,
  (SELECT count(*) FROM oficial_inscritos i JOIN oficial_eventos e ON e.id = i.evento_id WHERE e.campeonato_id = c.id) AS inscritos,
  (SELECT count(*) FROM oficial_grupos g JOIN oficial_eventos e ON e.id = g.evento_id WHERE e.campeonato_id = c.id) AS grupos,
  (SELECT count(*) FROM oficial_partidos p JOIN oficial_eventos e ON e.id = p.evento_id WHERE e.campeonato_id = c.id) AS partidos
FROM oficial_campeonatos c
WHERE c.club_id = '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430' AND c.nombre = '2do ZONAL INDIVIDUAL MET2 Costa';
