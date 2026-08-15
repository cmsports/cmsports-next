-- El ranking 2026 de la Asociación Buin y Paine, del papel a la base.
--
-- ── Qué es esto ───────────────────────────────────────────────────────────
-- La asociación llevaba su ranking en planilla desde antes de usar el sistema.
-- Son cinco listados —SUB13, SUB15, SUB19, TC"A" y TCB— con 130 puntajes de 72
-- personas. Esos torneos no están cargados, así que los puntos no se pueden
-- recalcular: entran como saldo de arranque (migración 188) y lo que se juegue
-- de acá en adelante suma encima.
--
-- ── Cómo se identificó a cada uno ─────────────────────────────────────────
-- En el papel los jugadores están como "M.MEIRELLES" o "A.CALDERON". Eso no
-- alcanza para colgar puntos de una ficha, y equivocarse no es un error de una
-- fila: el ranking se acumula por jugador, así que el error se arrastra en cada
-- torneo que venga.
--
-- Se identificaron en dos rondas con la propia asociación. Casos que solo ellos
-- podían resolver:
--   · SUB15 tenía "A.CALDERON" (310 pts) y "ALEX. CALDERÓN" (9 pts): dos
--     personas distintas, las dos con A. Son Agustín Calderón Vera y Alexander
--     Calderón Diaz.
--   · TCB tenía "J.GONZALEZ" (100 pts) y "JUAN GONZALEZ" (9 pts): Jorge
--     González Nuñez y Juan Carlos González Alarcón.
--   · "I. IGNACIO" no era un apellido: es Ian Ignacio Lagos Torres.
--   · "D.TORRES" lo anotaron primero como Diego; por RUT resultó ser Daniel
--     Eduardo Torres Villalobos.
--
-- En siete casos había DOS fichas de la misma persona —la real y una suelta sin
-- RUT, creada al inscribirla a un torneo escribiendo el nombre a mano—. La
-- asociación eligió la ficha real en los siete, así que el saldo va ahí.
--
-- ── Los que quedan fuera ──────────────────────────────────────────────────
-- Seis personas del papel ya no están en el club y no tienen ficha:
-- A.MEIRELLES, B.CAMPOS, C.VALENZUELA, F.BAEZ, R.GUZMAN y S.PEREZ. Sus 9
-- puntajes no se cargan. No se les inventa una ficha para sostener puntos de
-- alguien que no volvió.
--
-- Van 121 filas de las 130 del papel.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('189_ranking_papel_buin_2026');

-- ── 1. Las tres visitas que faltaban ──────────────────────────────────────
-- Juegan los torneos del club y suman ranking, pero no son socios: no pagan
-- mensualidad, no pasan lista y no tienen cuenta en la app. Eso es exactamente
-- `es_externo`. Se crean con RUT, así que no se confunden con nadie.
INSERT INTO public.jugadores (club_id, nombre, rut, categoria, sesiones_limite, es_externo, estado)
SELECT 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', v.nombre, v.rut, 'principiante', 0, true, 'activo'
FROM (VALUES
  ('Agustina Soto Olivos',      '22514474-5'),
  ('José Miguel Croff Brizuela','13905776-7'),
  ('Rodrigo Salazar Fuenzalida','18716784-1')
) AS v(nombre, rut)
WHERE NOT EXISTS (
  SELECT 1 FROM public.jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND replace(upper(j.rut), '.', '') = replace(upper(v.rut), '.', '')
);

-- ── 2. Las cinco categorías del ranking ───────────────────────────────────
-- No son las del sistema (PENECA, INFANTIL, JUVENIL, MASTER…). Las SUB son por
-- tope de edad y no son excluyentes: un chico de 12 entra en SUB13 y también en
-- SUB15, y por eso en el papel la misma persona aparece en varios listados.
-- TC"A" y TCB son por nivel: en TCB no juegan los diez mejores del TC"A".
-- Las cinco son mixtas, confirmado por la asociación.
INSERT INTO public.categorias_personalizadas (club_id, nombre)
SELECT 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', v.nombre
FROM (VALUES ('SUB13'), ('SUB15'), ('SUB19'), ('TC"A"'), ('TCB')) AS v(nombre)
ON CONFLICT DO NOTHING;

-- ── 3. Los saldos ─────────────────────────────────────────────────────────
CREATE TEMP TABLE _saldo_papel (
  clave_papel text,
  rut         text,
  nombre_ficha text,
  categoria   text,
  puntos      integer
) ON COMMIT DROP;

INSERT INTO _saldo_papel (clave_papel, rut, nombre_ficha, categoria, puntos) VALUES
  ('A.BERNAZAR', '24282469-5', 'Amir Antonio Bernazar Gallardo', 'SUB13', 100),
  ('A.BERNAZAR', '24282469-5', 'Amir Antonio Bernazar Gallardo', 'SUB15', 400),
  ('A.BERNAZAR', '24282469-5', 'Amir Antonio Bernazar Gallardo', 'TCB', 9),
  ('A.CALDERON', '24171067-K', 'Agustín Edison Leonel Calderón Vera', 'SUB13', 60),
  ('A.CALDERON', '24171067-K', 'Agustín Edison Leonel Calderón Vera', 'SUB15', 310),
  ('A.CALDERON', '24171067-K', 'Agustín Edison Leonel Calderón Vera', 'SUB19', 50),
  ('A.CALDERON', '24171067-K', 'Agustín Edison Leonel Calderón Vera', 'TC"A"', 9),
  ('A.CALDERON', '24171067-K', 'Agustín Edison Leonel Calderón Vera', 'TCB', 20),
  ('ALEX. CALDERÓN', '24459917-6', 'Alexander Calderón Diaz', 'SUB15', 9),
  ('A.ESPINA', '24841079-5', 'Augusto Esteban Espina Oyarzun', 'SUB13', 60),
  ('A.ESPINA', '24841079-5', 'Augusto Esteban Espina Oyarzun', 'SUB15', 69),
  ('A.FERRER', '23933831-3', 'Alonso Daniel Ferrer Moreno', 'SUB15', 140),
  ('A.FERRER', '23933831-3', 'Alonso Daniel Ferrer Moreno', 'SUB19', 60),
  ('A.GARCES', NULL, 'alejandro garces', 'TC"A"', 290),
  ('A.IMILQUEO', '23208195-3', 'Alan máximo Imilqueo Altamirano', 'SUB19', 18),
  ('A.IMILQUEO', '23208195-3', 'Alan máximo Imilqueo Altamirano', 'TC"A"', 9),
  ('A.IMILQUEO', '23208195-3', 'Alan máximo Imilqueo Altamirano', 'TCB', 9),
  ('A.LABRIN', '18087148-9', 'Álvaro Adolfo Labrin Decar', 'TC"A"', 69),
  ('A.LABRIN', '18087148-9', 'Álvaro Adolfo Labrin Decar', 'TCB', 60),
  ('A.OLEA', '24287635-0', 'Arturo Olea Reale', 'SUB13', 70),
  ('A.QUINTEROS', '23099644-k', 'Agustín Quinteros quinteros', 'SUB19', 130),
  ('A.QUINTEROS', '23099644-k', 'Agustín Quinteros quinteros', 'TC"A"', 20),
  ('A.QUINTEROS', '23099644-k', 'Agustín Quinteros quinteros', 'TCB', 180),
  ('A.SOTO', '22514474-5', 'AGUSTINA SOTO OLIVOS', 'SUB19', 60),
  ('A.SOTO', '22514474-5', 'AGUSTINA SOTO OLIVOS', 'TCB', 60),
  ('B.CARO', '24495310-7', 'Benjamín Ignacio Caro Ramirez', 'SUB13', 90),
  ('B.CARO', '24495310-7', 'Benjamín Ignacio Caro Ramirez', 'SUB15', 260),
  ('B.CARO', '24495310-7', 'Benjamín Ignacio Caro Ramirez', 'TCB', 20),
  ('B.GAETE', '23176528-K', 'Benjamin Alfredo Gaete Inostroza', 'SUB19', 69),
  ('B.GAETE', '23176528-K', 'Benjamin Alfredo Gaete Inostroza', 'TC"A"', 60),
  ('B.GAETE', '23176528-K', 'Benjamin Alfredo Gaete Inostroza', 'TCB', 89),
  ('B.LOBOS', '23732581-8', 'Benjamin Alonso Lobos Lizama', 'SUB19', 9),
  ('C.CASTAÑEDA', '15583614-8', 'Cristian Castañeda Álvarez', 'TC"A"', 20),
  ('C.CASTAÑEDA', '15583614-8', 'Cristian Castañeda Álvarez', 'TCB', 190),
  ('C.ECHEVERRIA', '23787621-0', 'Cristóbal Jacobo Echeverria Jorquera', 'SUB15', 18),
  ('C.GARCIA', '22495691-6', 'Cristóbal Felipe García Arriagada', 'TC"A"', 120),
  ('C.GONZALEZ', '19313040-2', 'Colomba González González', 'SUB15', 89),
  ('CONSTANZA ZURITA', '24068946-4', 'Constanza Isabella Zurita Vega', 'SUB15', 20),
  ('CRISTÓBAL ZURITA', '23201543-8', 'Cristóbal Alonso Zurita Vega', 'SUB15', 9),
  ('D.LOPEZ', NULL, 'diana lopez', 'TC"A"', 150),
  ('D.Ramirez', '24182702-K', 'Diego Nicolás Ramírez Navarrete', 'SUB15', 80),
  ('D.TORRES', '26016943-2', 'Daniel Eduardo Torres Villalobos', 'SUB15', 29),
  ('D.TORRES', '26016943-2', 'Daniel Eduardo Torres Villalobos', 'SUB19', 9),
  ('E.MUÑOZ', '21589290-5', 'Edison Muñoz Hernández', 'TC"A"', 250),
  ('E. OCARES', '17705646-4', 'Eduardo Andrés Ocares Carrasco', 'TC"A"', 20),
  ('F.GOMEZ', '24120615-7', 'Facundo Alberto Gomez Retamal', 'SUB15', 210),
  ('F.GOMEZ', '24120615-7', 'Facundo Alberto Gomez Retamal', 'SUB19', 20),
  ('F.RIVAS', '24370009-4', 'Francisco Javier Rivas Pino', 'SUB13', 160),
  ('F.RIVAS', '24370009-4', 'Francisco Javier Rivas Pino', 'SUB15', 60),
  ('F.RIVAS', '24370009-4', 'Francisco Javier Rivas Pino', 'TCB', 9),
  ('F.URRIOLA', '23219813-3', 'Fernando Alonso Urriola Jara', 'SUB19', 150),
  ('F.URRIOLA', '23219813-3', 'Fernando Alonso Urriola Jara', 'TC"A"', 120),
  ('H.MUÑOZ', '23909275-6', 'Horacio Valentino Muñoz Morán', 'SUB15', 29),
  ('I.AGUILERA', '22730263-1', 'Isaias esteban Aguilera Painequeo', 'TCB', 90),
  ('I.ARAYA', '17559574-0', 'Ivan Araya Araya', 'TC"A"', 270),
  ('I.GOMEZ', '25334201-3', 'Isidora Teresa Gomez Retamal', 'SUB13', 18),
  ('I.GOMEZ', '25334201-3', 'Isidora Teresa Gomez Retamal', 'SUB15', 9),
  ('I. IGNACIO', '24567575-5', 'Ian Ignacio Lagos Torres', 'SUB15', 9),
  ('I.LOYOLA', '20888735-1', 'Iván Loyola Carvajal', 'TC"A"', 18),
  ('I.LOYOLA', '20888735-1', 'Iván Loyola Carvajal', 'TCB', 60),
  ('J.AMIGO', '24663761-K', 'Julieta Ivonne Amigo León', 'SUB13', 180),
  ('J.AMIGO', '24663761-K', 'Julieta Ivonne Amigo León', 'SUB15', 189),
  ('J.CROFF', '13905776-7', 'José Miguel Croff Brizuela', 'TC"A"', 20),
  ('J.CROFF', '13905776-7', 'José Miguel Croff Brizuela', 'TCB', 70),
  ('J.GONZALEZ', '15816709-3', 'JORGE GONZALEZ NUÑEZ', 'TCB', 100),
  ('JUAN GONZALEZ', '16583070-9', 'Juan Carlos González Alarcón', 'TCB', 9),
  ('J.KANIA', '10386071-7', 'Juan Carlos Kania Kuhl', 'TC"A"', 9),
  ('J.KANIA', '10386071-7', 'Juan Carlos Kania Kuhl', 'TCB', 69),
  ('J.ORELLANA', NULL, 'joaquin orellana', 'TC"A"', 170),
  ('J.PARRA', '23842661-8', 'Juan pablo Parra Gonzalez', 'SUB15', 140),
  ('J.PARRA', '23842661-8', 'Juan pablo Parra Gonzalez', 'TC"A"', 20),
  ('J.PARRA', '23842661-8', 'Juan pablo Parra Gonzalez', 'TCB', 100),
  ('J.SANCHEZ', '24113529-2', 'José tomás Sánchez Hernández', 'SUB15', 230),
  ('J.SANCHEZ', '24113529-2', 'José tomás Sánchez Hernández', 'SUB19', 60),
  ('J.SANCHEZ', '24113529-2', 'José tomás Sánchez Hernández', 'TCB', 40),
  ('J.TRONCOSO', '24033663-4', 'Julián Agustín Troncoso Alaniz', 'SUB13', 9),
  ('J.TRONCOSO', '24033663-4', 'Julián Agustín Troncoso Alaniz', 'SUB15', 9),
  ('J.VALDERRAMA', '22920252-9', 'Joaquín Arturo Valderrama Romo', 'SUB19', 180),
  ('J.VALDERRAMA', '22920252-9', 'Joaquín Arturo Valderrama Romo', 'TC"A"', 160),
  ('L.MORALES', '24460203-7', 'Lucas Michel Morales Fuentes', 'SUB13', 9),
  ('L.RUIZ', '21920421-3', 'Lucas Simón Ruiz Soto', 'TCB', 100),
  ('M.MEIRELLES', '24206036-9', 'Máximo Enrique Meirelles Bascuñán', 'SUB13', 240),
  ('M.MEIRELLES', '24206036-9', 'Máximo Enrique Meirelles Bascuñán', 'SUB15', 9),
  ('M.MEIRELLES', '24206036-9', 'Máximo Enrique Meirelles Bascuñán', 'TCB', 9),
  ('M.MORALES', '23331815-9', 'Martín Gregorio Morales Moran', 'SUB19', 49),
  ('M.MORALES', '23331815-9', 'Martín Gregorio Morales Moran', 'TC"A"', 9),
  ('M.MORALES', '23331815-9', 'Martín Gregorio Morales Moran', 'TCB', 70),
  ('M.MUÑOZ', '22315514-6', 'Matías Muñoz Rojas', 'SUB19', 200),
  ('M.MUÑOZ', '22315514-6', 'Matías Muñoz Rojas', 'TC"A"', 240),
  ('M.RIVAS', '23748356-1', 'MATIAS RIVAS', 'SUB15', 20),
  ('M.RIVAS', '23748356-1', 'MATIAS RIVAS', 'TC"A"', 9),
  ('M.SCHILLING', '17083843-2', 'Mirtha Elena Schilling Varela', 'TC"A"', 29),
  ('M.SCHILLING', '17083843-2', 'Mirtha Elena Schilling Varela', 'TCB', 120),
  ('M.VASQUEZ', '24389173-6', 'Matías Cristian Vasquez Rodríguez', 'SUB13', 60),
  ('M.VASQUEZ', '24389173-6', 'Matías Cristian Vasquez Rodríguez', 'SUB15', 18),
  ('M.VASQUEZ', '24389173-6', 'Matías Cristian Vasquez Rodríguez', 'TCB', 9),
  ('N.RIVAS', NULL, 'nicolas rivas', 'TC"A"', 29),
  ('O.CABRERA', '8929031-7', 'OMAR CABRERA', 'TC"A"', 9),
  ('O.CABRERA', '8929031-7', 'OMAR CABRERA', 'TCB', 89),
  ('R.AMIGO', '23482539-9', 'Renato Andrés Amigo León', 'SUB19', 29),
  ('R.AMIGO', '23482539-9', 'Renato Andrés Amigo León', 'TC"A"', 9),
  ('R.AMIGO', '23482539-9', 'Renato Andrés Amigo León', 'TCB', 110),
  ('R.LOPEZ', '23768600-4', 'Ricardo Anibal López Araos', 'SUB19', 30),
  ('R.RIVERA', '2405786-0', 'Randy Leonardo Rivera Morales', 'SUB15', 20),
  ('R.RIVERA', '2405786-0', 'Randy Leonardo Rivera Morales', 'SUB19', 9),
  ('R.RIVERA', '2405786-0', 'Randy Leonardo Rivera Morales', 'TCB', 79),
  ('R.SALAZAR', '18716784-1', 'RODRIGO SALAZAR FUENZALIDA', 'TC"A"', 20),
  ('S.LUENGO', '23999723-6', 'Simón Andrés Luengo Gutiérrez', 'SUB15', 20),
  ('T.CEBALLOS', '22911520-0', 'Tomas Ignacio Ceballos Muñoz', 'SUB19', 80),
  ('T.CEBALLOS', '22911520-0', 'Tomas Ignacio Ceballos Muñoz', 'TC"A"', 200),
  ('T.LOPEZ', '24194451-4', 'Tomas Ignacio Lopez Garrido', 'SUB15', 60),
  ('V.GARCIA', '24058387-9', 'VICENTE TOMÁS GARCÍA AGÜERO', 'SUB15', 150),
  ('V.GARCIA', '24058387-9', 'VICENTE TOMÁS GARCÍA AGÜERO', 'TC"A"', 9),
  ('V.GONZALEZ', '24282913-1', 'Vicente Ignacio González Meza', 'SUB13', 170),
  ('V.GONZALEZ', '24282913-1', 'Vicente Ignacio González Meza', 'SUB15', 20),
  ('V.GONZALEZ', '24282913-1', 'Vicente Ignacio González Meza', 'TCB', 9),
  ('V.RODRIGUEZ', '8716412-8', 'Victor Rodríguez Mardones', 'TC"A"', 18),
  ('V.RODRIGUEZ', '8716412-8', 'Victor Rodríguez Mardones', 'TCB', 20),
  ('V.ROJAS', '24231149-3', 'Vicente Rojas Rojas', 'SUB15', 20),
  ('V.SEGUEL', '22733984-5', 'Vicente Alejandro Seguel Araya', 'SUB19', 9),
  ('V.SEGUEL', '22733984-5', 'Vicente Alejandro Seguel Araya', 'TCB', 9);

-- Cada fila tiene que resolver a UN jugador de Buin. Por RUT cuando lo hay; por
-- nombre normalizado en los cuatro perfiles que nunca tuvieron RUT.
CREATE TEMP TABLE _saldo_resuelto ON COMMIT DROP AS
SELECT s.*, (
  SELECT j.id FROM public.jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND CASE WHEN s.rut IS NOT NULL
             THEN replace(upper(j.rut), '.', '') = replace(upper(s.rut), '.', '')
             ELSE public._norm_nombre(j.nombre) = public._norm_nombre(s.nombre_ficha)
        END
  LIMIT 1
) AS jugador_id
FROM _saldo_papel s;

-- El portazo de verdad: si alguna fila no encontró jugador, aborta todo. Es
-- preferible a cargar un ranking con agujeros y descubrirlo en tres meses.
DO $$
DECLARE faltan int;
DECLARE detalle text;
BEGIN
  SELECT count(*), string_agg(DISTINCT clave_papel, ', ')
    INTO faltan, detalle
  FROM _saldo_resuelto WHERE jugador_id IS NULL;
  IF faltan > 0 THEN
    RAISE EXCEPTION 'No se pudo identificar a % fila(s): %', faltan, detalle;
  END IF;
END $$;

-- Y que dos nombres del papel no hayan caído en la misma ficha.
DO $$
DECLARE choques text;
BEGIN
  SELECT string_agg(clave_papel, ' + ') INTO choques
  FROM (
    SELECT string_agg(DISTINCT clave_papel, ' + ') AS clave_papel
    FROM _saldo_resuelto GROUP BY jugador_id, categoria HAVING count(DISTINCT clave_papel) > 1
  ) t;
  IF choques IS NOT NULL THEN
    RAISE EXCEPTION 'Dos nombres del papel apuntan al mismo jugador: %', choques;
  END IF;
END $$;

INSERT INTO public.ranking_saldo_inicial (club_id, jugador_id, categoria, genero, puntos, origen)
SELECT 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc', jugador_id, categoria, 'mixto', puntos,
       'Ranking en papel Asoc. Buin-Paine 2026'
FROM _saldo_resuelto
ON CONFLICT DO NOTHING;

-- ── 4. El cuadre ──────────────────────────────────────────────────────────
-- Los totales tienen que dar exactamente lo que se calculó del papel. Si no,
-- algo se perdió en el camino y es mejor no dejarlo pasar.
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(format('%s: esperado %s, quedó %s', c.categoria, c.total, coalesce(r.total, 0)), ' | ')
    INTO malas
  FROM (VALUES
  ('SUB13', 1226),
  ('SUB15', 2655),
  ('TCB', 1808),
  ('SUB19', 1221),
  ('TC"A"', 2385)
  ) AS c(categoria, total)
  LEFT JOIN (
    SELECT categoria, sum(puntos) AS total
    FROM public.ranking_saldo_inicial
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    GROUP BY categoria
  ) r ON r.categoria = c.categoria
  WHERE coalesce(r.total, 0) <> c.total;
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Los totales no cuadran -> %', malas;
  END IF;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) 121 filas, 66 jugadores, 5 categorías.
SELECT count(*) AS filas, count(DISTINCT jugador_id) AS jugadores, count(DISTINCT categoria) AS categorias
FROM public.ranking_saldo_inicial
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- 2) El top de cada categoría, para mirarlo contra el papel.
SELECT s.categoria, j.nombre, s.puntos
FROM public.ranking_saldo_inicial s
JOIN public.jugadores j ON j.id = s.jugador_id
WHERE s.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
ORDER BY s.categoria, s.puntos DESC;
