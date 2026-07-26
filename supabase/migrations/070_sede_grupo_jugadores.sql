-- Sede (lugar de entrenamiento habitual) y grupo (MEN / ADU) por jugador.
-- Datos entregados por el profe en la reunión del 2026-07-26.
-- Ambos campos quedan editables desde la ficha del jugador.
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
--
-- IMPORTANTE: al final la migración devuelve la lista de jugadores del padrón
-- que NO se pudieron emparejar por nombre. Revísala: esos hay que completarlos
-- a mano desde la ficha (los nombres del padrón no calzan con los de la base).

BEGIN;

ALTER TABLE jugadores
  ADD COLUMN IF NOT EXISTS sede  text,
  ADD COLUMN IF NOT EXISTS grupo text;   -- por si el club aún no lo tenía

-- Normaliza para comparar: sin acentos, sin dobles espacios, minúsculas.
CREATE OR REPLACE FUNCTION public._norm_nombre(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(COALESCE(txt, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Sin ON COMMIT DROP: la consulta de revisión de más abajo corre después del
-- COMMIT y necesita la tabla viva (se borra sola al cerrar la sesión).
CREATE TEMP TABLE _padron (
  nombres   text,
  apellido1 text,
  apellido2 text,
  grupo     text,
  sede      text
);

INSERT INTO _padron (nombres, apellido1, apellido2, grupo, sede) VALUES
  ('Agustin','Quinteros','Fuentes','MEN','ambos'),
  ('Agustín Edison Leonel','Calderón','Vera','MEN','buin'),
  ('Alan máximo','Imilqueo','Altamirano','MEN','buin'),
  ('Alberto','HONORES','','ADU','buin'),
  ('Alberto Andrés','Vergara','Sánchez','ADU','buin'),
  ('Alexander','Calderón','Diaz','MEN','paine'),
  ('Alonso Daniel','Ferrer','Moreno','MEN','paine'),
  ('Alonso Ignacio','Ramírez','Duran','MEN','paine'),
  ('Alvaro','Moya','Obregón','ADU','paine'),
  ('Álvaro Adolfo','Labrin','Decar','ADU','paine'),
  ('Amir Antonio','Bernazar','Gallardo','MEN','ambos'),
  ('Arnaldo alexis','Marchant','Pinto','ADU','buin'),
  ('Arturo','Olea','Reale','MEN','paine'),
  ('Augusto Esteban','Espina','Oyarzun','MEN','buin'),
  ('Bastian','Cheuqueman','Espinoza','MEN','buin'),
  ('Benjamin Alfredo','Gaete','Inostroza','MEN','paine'),
  ('Benjamin Alonso','Lobos','Lizama','MEN','ambos'),
  ('Benjamin ignacio','Neira','Becerra','MEN','buin'),
  ('Benjamín Ignacio','Caro','Ramirez','MEN','paine'),
  ('Benjamín Joel','Vera','Calderón','MEN','buin'),
  ('Benjamín Nicolás','Arias','Álamos','ADU','ambos'),
  ('Carlos','Vera','Martinez','ADU','buin'),
  ('Christopher David','Martínez','Arancibia','ADU','buin'),
  ('Colomba','González','González','MEN','buin'),
  ('Constanza Isabella','Zurita','Vega','MEN','paine'),
  ('Crisse','Acevedo','Rios','ADU','ambos'),
  ('Cristian','Castañeda','Álvarez','ADU','buin'),
  ('Cristóbal Alonso','Zurita','Vega','MEN','paine'),
  ('Cristóbal Felipe','García','Arriagada','ADU','buin'),
  ('Cristóbal Jacobo','Echeverria','Jorquera','MEN','buin'),
  ('Cristóbal Norberto','Muñoz','Dinamarca','ADU','paine'),
  ('Daniel Eduardo','Torres','Villalobos','MEN','buin'),
  ('David Ezequiel','Corral','Moya','MEN','buin'),
  ('Diego Nicolás','Ramírez','Navarrete','MEN','buin'),
  ('Eduardo Andrés','Ocares','Carrasco','ADU','buin'),
  ('Erik','Rubio','Rubio','ADU','buin'),
  ('Facundo Alberto','Gomez','Retamal','MEN','buin'),
  ('Fernando','Bastias','Sandoval','MEN','buin'),
  ('Fernando Alonso','Urriola','Jara','MEN','ambos'),
  ('Florencia','Albornoz','Torres','MEN','buin'),
  ('Francisco Javier','Rivas','Pino','MEN','paine'),
  ('Franco','Rencoret','Cortez','MEN','buin'),
  ('Freddy','Moyano','Garfias','ADU','buin'),
  ('Horacio Valentino','Muñoz','Morán','MEN','paine'),
  ('Isaias esteban','Aguilera','Painequeo','MEN','buin'),
  ('Isidora Teresa','Gomez','Retamal','MEN','buin'),
  ('Ivan','Araya','Araya','ADU','paine'),
  ('Iván','Loyola','Carvajal','ADU','paine'),
  ('Javier Ignacio','Curimil','Rojas','ADU','paine'),
  ('Jesus Enrique','Colmenarez','Arguello','ADU','buin'),
  ('Joaquín Arturo','Valderrama','Romo','MEN','ambos'),
  ('Jonathan Andrés','Torres','Argel','ADU','buin'),
  ('JORGE','GONZALEZ','NUÑEZ','ADU','ambos'),
  ('Jorge Luis','Pino','Campos','ADU','buin'),
  ('José Antonio','Plaza','Romo','ADU','ambos'),
  ('José Luis','Leiva','Zúñiga','ADU','buin'),
  ('José tomás','Sánchez','Hernández','MEN','ambos'),
  ('José Tomás','Lopez','Peys','MEN','paine'),
  ('Juan Carlos','Kania','Kuhl','ADU','ambos'),
  ('Juan Carlos','González','Alarcón','ADU','buin'),
  ('Juan Pablo','Gutierrez','Alvarez','ADU','buin'),
  ('Juan pablo','Parra','Gonzalez','MEN','ambos'),
  ('Julián Agustín','Troncoso','Alaniz','MEN','buin'),
  ('Julieta Ivonne','Amigo','León','MEN','paine'),
  ('Karina','Burgos','Pavez','ADU','paine'),
  ('Lucas Michel','Morales','Fuentes','MEN','buin'),
  ('Lucas Simón','Ruiz','Soto','ADU','paine'),
  ('Luciano Enrique','Colmenarez','Liendo','MEN','buin'),
  ('Martín','Denzer','Lira','MEN','buin'),
  ('Martín Gregorio','Morales','Moran','MEN','paine'),
  ('Mateo Andrés','Romero','Galleguillos','MEN','buin'),
  ('Mateo León','Cano','Espinosa','MEN','buin'),
  ('MATIAS','RIVAS','','MEN','paine'),
  ('matias','Guzman','Escobar','ADU','paine'),
  ('Matías Cristian','Vasquez','Rodríguez','MEN','buin'),
  ('Matías','Muñoz','Rojas','ADU','ambos'),
  ('Maximiliano Andrés','Cabrera','Levalle','MEN','buin'),
  ('Maximiliano Joaquín','Flores','Alarcón','MEN','buin'),
  ('Máximo Enrique','Meirelles','Bascuñán','MEN','paine'),
  ('Mirtha Elena','Schilling','Varela','ADU','ambos'),
  ('Nicolás Felipe','Contreras','Jofré','ADU','buin'),
  ('Nicolas Josue','Diaz','Balcazar','MEN','ambos'),
  ('OMAR','CABRERA','','ADU','paine'),
  ('Osvaldo Javier','Bastias','Sandoval','MEN','buin'),
  ('Patricio Ignacio','Farías','Pérez','ADU','buin'),
  ('Randy Leonardo','Rivera','Morales','MEN','paine'),
  ('Renato Andrés','Amigo','León','MEN','paine'),
  ('Ricardo Andres','Suarez','Lira','MEN','buin'),
  ('Ricardo Anibal','López','Araos','MEN','ambos'),
  ('Rodrigo Sebastián','Pizarro','Cabello','ADU','buin'),
  ('Ruddy Maximiliano','López','Morales','MEN','buin'),
  ('Simón Andrés','Luengo','Gutiérrez','MEN','buin'),
  ('Sofia Paz','Salgado','Gaete','MEN','buin'),
  ('Tomas','Quintana','Balcazar','MEN','ambos'),
  ('Tomás Andrés','Contreras','Arancibia','ADU','buin'),
  ('Tomas Ignacio','Ceballos','Muñoz','MEN','ambos'),
  ('Tomas Ignacio','Lopez','Garrido','MEN','paine'),
  ('Valentina Anaís','Zurita','Vega','MEN','paine'),
  ('Vicente','Rojas','Rojas','MEN','paine'),
  ('Vicente Alejandro','Seguel','Araya','MEN','ambos'),
  ('Vicente Ignacio','González','Meza','MEN','buin'),
  ('VICENTE TOMÁS','GARCÍA','AGÜERO','MEN','ambos'),
  ('VICTOR','SOTO','','ADU','buin'),
  ('Victor','Rodríguez','Mardones','ADU','paine'),
  ('vilma','letelier','','ADU','buin'),
  ('yuri','torres','','ADU','paine');

-- Emparejamiento por nombre completo normalizado. Solo se aplica cuando el
-- padrón y la base coinciden en exactamente un jugador: nunca se adivina.
WITH candidatos AS (
  SELECT
    j.id AS jugador_id,
    p.nombres, p.apellido1, p.apellido2, p.grupo, p.sede,
    count(*) OVER (PARTITION BY public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)) AS veces_padron,
    count(*) OVER (PARTITION BY j.id) AS veces_jugador
  FROM _padron p
  JOIN jugadores j
    ON j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
   AND public._norm_nombre(j.nombre)
       = public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)
)
UPDATE jugadores j
SET grupo     = c.grupo,
    sede      = c.sede,
    nombres   = COALESCE(NULLIF(btrim(c.nombres), ''),   j.nombres),
    apellido1 = COALESCE(NULLIF(btrim(c.apellido1), ''), j.apellido1),
    apellido2 = COALESCE(NULLIF(btrim(c.apellido2), ''), j.apellido2)
FROM candidatos c
WHERE j.id = c.jugador_id
  AND c.veces_padron = 1
  AND c.veces_jugador = 1;

COMMIT;

-- ── Revisión: jugadores del padrón que quedaron SIN emparejar ──────────────
-- Complétalos a mano desde la ficha del jugador (Editar > Grupo y Sede).
SELECT p.nombres, p.apellido1, p.apellido2, p.grupo, p.sede
FROM _padron p
WHERE NOT EXISTS (
  SELECT 1 FROM jugadores j
  WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
    AND public._norm_nombre(j.nombre)
        = public._norm_nombre(p.nombres || ' ' || p.apellido1 || ' ' || p.apellido2)
)
ORDER BY p.apellido1, p.nombres;
