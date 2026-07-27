-- Mensualidad real de cada jugador, según la planilla de pagos del profe.
--
-- El monto NO se deduce del plan ni de los días que entrena: lo fija el profe
-- caso a caso. Por eso hay valores como $7.000, $21.000, $26.250 o $50.000 que
-- no calzan con ninguna tabla. Hasta ahora el sistema los estimaba por el plan
-- (15/25/30/40 mil) y se registraban pagos por montos equivocados.
--
-- Criterio: se toma el pago de JULIO; si ese mes está pendiente, el de JUNIO.
-- Quien no pagó ninguno de los dos queda sin monto, para que el profe lo cargue.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Al final devuelve el antes/después y los que no se pudieron emparejar.

BEGIN;

CREATE TEMP TABLE _pagos (
  nombres   text,
  apellido1 text,
  apellido2 text,
  monto     integer   -- NULL = sin pago registrado en junio ni julio
);

INSERT INTO _pagos (nombres, apellido1, apellido2, monto) VALUES
  ('Agustin','Quinteros','Fuentes',50000),
  ('Agustín Edison Leonel','Calderón','Vera',50000),
  ('Alan máximo','Imilqueo','Altamirano',40000),
  ('Alberto','HONORES','',25000),
  ('Alberto Andrés','Vergara','Sánchez',NULL),
  ('Alexander','Calderón','Diaz',22500),
  ('Alonso Daniel','Ferrer','Moreno',40000),
  ('Alonso Ignacio','Ramírez','Duran',22500),
  ('Alvaro','Moya','Obregón',NULL),
  ('Álvaro Adolfo','Labrin','Decar',30000),
  ('Amir Antonio','Bernazar','Gallardo',35000),
  ('Arnaldo alexis','Marchant','Pinto',35000),
  ('Arturo','Olea','Reale',25000),
  ('Augusto Esteban','Espina','Oyarzun',40000),
  ('Bastian','Cheuqueman','Espinoza',35000),
  ('Benjamin Alfredo','Gaete','Inostroza',40000),
  ('Benjamin Alonso','Lobos','Lizama',35000),
  ('Benjamin ignacio','Neira','Becerra',30000),
  ('Benjamín Ignacio','Caro','Ramirez',30000),
  ('Benjamín Joel','Vera','Calderón',NULL),
  ('Benjamín Nicolás','Arias','Álamos',25000),
  ('Carlos','Vera','Martinez',25000),
  ('Christopher David','Martínez','Arancibia',30000),
  ('Colomba','González','González',40000),
  ('Constanza Isabella','Zurita','Vega',21000),
  ('Crisse','Acevedo','Rios',25000),
  ('Cristian','Castañeda','Álvarez',40000),
  ('Cristóbal Alonso','Zurita','Vega',21000),
  ('Cristóbal Felipe','García','Arriagada',21000),
  ('Cristóbal Jacobo','Echeverria','Jorquera',25000),
  ('Cristóbal Norberto','Muñoz','Dinamarca',NULL),
  ('Daniel Eduardo','Torres','Villalobos',35000),
  ('David Ezequiel','Corral','Moya',30000),
  ('Diego Nicolás','Ramírez','Navarrete',35000),
  ('Eduardo Andrés','Ocares','Carrasco',35000),
  ('Erik','Rubio','Rubio',NULL),
  ('Facundo Alberto','Gomez','Retamal',26250),
  ('Fernando','Bastias','Sandoval',NULL),
  ('Fernando Alonso','Urriola','Jara',30000),
  ('Florencia','Albornoz','Torres',30000),
  ('Francisco Javier','Rivas','Pino',22500),
  ('Franco','Rencoret','Cortez',30000),
  ('Freddy','Moyano','Garfias',25000),      -- julio $7.000 parece abono parcial
  ('Horacio Valentino','Muñoz','Morán',30000),
  ('Isaias esteban','Aguilera','Painequeo',35000),
  ('Isidora Teresa','Gomez','Retamal',26250),
  ('Ivan','Araya','Araya',30000),
  ('Iván','Loyola','Carvajal',22000),
  ('Javier Ignacio','Curimil','Rojas',NULL),
  ('Jesus Enrique','Colmenarez','Arguello',NULL),
  ('Joaquín Arturo','Valderrama','Romo',35000),
  ('Jonathan Andrés','Torres','Argel',35000),
  ('JORGE','GONZALEZ','NUÑEZ',26000),
  ('Jorge Luis','Pino','Campos',30000),
  ('José Antonio','Plaza','Romo',30000),
  ('José Luis','Leiva','Zúñiga',30000),
  ('José tomás','Sánchez','Hernández',40000),
  ('José Tomás','Lopez','Peys',NULL),
  ('Juan Carlos','Kania','Kuhl',30000),
  ('Juan Carlos','González','Alarcón',12500),
  ('Juan Pablo','Gutierrez','Alvarez',30000),
  ('Juan pablo','Parra','Gonzalez',26250),
  ('Julián Agustín','Troncoso','Alaniz',30000),
  ('Julieta Ivonne','Amigo','León',30600),
  ('Karina','Burgos','Pavez',30000),
  ('Lucas Michel','Morales','Fuentes',26000),
  ('Lucas Simón','Ruiz','Soto',25000),
  ('Luciano Enrique','Colmenarez','Liendo',NULL),
  ('Martín','Denzer','Lira',30000),
  ('Martín Gregorio','Morales','Moran',35000),
  ('Mateo Andrés','Romero','Galleguillos',30000),
  ('Mateo León','Cano','Espinosa',35000),
  ('MATIAS','RIVAS','',30000),
  ('matias','Guzman','Escobar',30000),
  ('Matías Cristian','Vasquez','Rodríguez',30000),
  ('Matías','Muñoz','Rojas',25000),
  ('Maximiliano Andrés','Cabrera','Levalle',40000),
  ('Maximiliano Joaquín','Flores','Alarcón',30000),
  ('Máximo Enrique','Meirelles','Bascuñán',30000),
  ('Mirtha Elena','Schilling','Varela',30000),
  ('Nicolás Felipe','Contreras','Jofré',35000),
  ('Nicolas Josue','Diaz','Balcazar',30000),
  ('OMAR','CABRERA','',25000),
  ('Osvaldo Javier','Bastias','Sandoval',NULL),
  ('Patricio Ignacio','Farías','Pérez',40000),
  ('Randy Leonardo','Rivera','Morales',22500),
  ('Renato Andrés','Amigo','León',30600),
  ('Ricardo Andres','Suarez','Lira',30000),
  ('Ricardo Anibal','López','Araos',30000),
  ('Rodrigo Sebastián','Pizarro','Cabello',30000),
  ('Ruddy Maximiliano','López','Morales',30000),
  ('Simón Andrés','Luengo','Gutiérrez',35000),
  ('Sofia Paz','Salgado','Gaete',NULL),
  ('Tomas','Quintana','Balcazar',26250),
  ('Tomás Andrés','Contreras','Arancibia',NULL),
  ('Tomas Ignacio','Ceballos','Muñoz',40000),
  ('Tomas Ignacio','Lopez','Garrido',22500),
  ('Valentina Anaís','Zurita','Vega',21000),
  ('Vicente','Rojas','Rojas',22500),
  ('Vicente Alejandro','Seguel','Araya',40000),
  ('Vicente Ignacio','González','Meza',36000),
  ('VICENTE TOMÁS','GARCÍA','AGÜERO',30000),
  ('VICTOR','SOTO','',25000),
  ('Victor','Rodríguez','Mardones',25000),
  ('vilma','letelier','',25000),
  ('yuri','torres','',NULL);

-- Se guarda el valor anterior para poder mostrar el antes/después.
CREATE TEMP TABLE _antes AS
SELECT id, nombre, mensualidad AS mensualidad_anterior
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- Solo se actualiza cuando el emparejamiento por nombre es único en ambos
-- lados: con plata de por medio, ante la duda no se toca nada.
WITH candidatos AS (
  SELECT
    j.id AS jugador_id,
    p.monto,
    count(*) OVER (PARTITION BY public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)) AS veces_padron,
    count(*) OVER (PARTITION BY j.id) AS veces_jugador
  FROM _pagos p
  JOIN jugadores j
    ON j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND public._norm_nombre(j.nombre)
       = public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)
  WHERE p.monto IS NOT NULL
)
UPDATE jugadores j
SET mensualidad = c.monto
FROM candidatos c
WHERE j.id = c.jugador_id
  AND c.veces_padron = 1
  AND c.veces_jugador = 1;

COMMIT;


-- ── 1. Antes y después de los que cambiaron ───────────────────────────────
SELECT
  a.nombre,
  a.mensualidad_anterior AS antes,
  j.mensualidad          AS ahora
FROM _antes a
JOIN jugadores j ON j.id = a.id
WHERE a.mensualidad_anterior IS DISTINCT FROM j.mensualidad
ORDER BY a.nombre;


-- ── 2. Del padrón: no se encontró a nadie con ese nombre ──────────────────
-- Corregilos a mano desde la ficha del jugador.
SELECT p.nombres, p.apellido1, p.apellido2, p.monto
FROM _pagos p
WHERE NOT EXISTS (
  SELECT 1 FROM jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND public._norm_nombre(j.nombre)
        = public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)
)
ORDER BY p.apellido1, p.nombres;


-- ── 3. Jugadores que quedaron sin mensualidad ─────────────────────────────
-- Son los que no pagaron ni junio ni julio (nuevos, no asistieron o pendientes
-- ambos meses). El profe tiene que cargarles el monto desde su ficha.
SELECT nombre, grupo, sede, mensualidad
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (es_externo IS NULL OR es_externo = false)
  AND (mensualidad IS NULL OR mensualidad = 0)
ORDER BY nombre;
