-- 063_dias_entrenamiento.sql
-- Agrega columnas de días de entrenamiento (L-V) y carga datos de planilla maestra
-- true = entrena ese día | false = NO entrena (X en planilla) | NULL = sin datos

ALTER TABLE jugadores
  ADD COLUMN IF NOT EXISTS entrena_lun boolean,
  ADD COLUMN IF NOT EXISTS entrena_mar boolean,
  ADD COLUMN IF NOT EXISTS entrena_mie boolean,
  ADD COLUMN IF NOT EXISTS entrena_jue boolean,
  ADD COLUMN IF NOT EXISTS entrena_vie boolean;

DO $$
DECLARE
  cid CONSTANT UUID := 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
BEGIN

-- Agustin Quinteros Fuentes — entrena todos los días
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='23099644K';

-- Agustín Edison Leonel Calderón Vera — entrena todos los días
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='24171067K';

-- Alan máximo Imilqueo Altamirano — no Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='232080957';

-- Alberto Andrés Vergara Sánchez — solo Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='19067309K';

-- Alexander Calderón Diaz — solo Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='244599176';

-- Alonso Daniel Ferrer Moreno — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='239338313';

-- Alonso Ignacio Ramírez Duran — solo Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='247688307';

-- Alvaro Moya Obregón — ningún día (todos X)
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND lower(trim(nombre)) LIKE '%moya%obregon%' OR (club_id=cid AND lower(trim(nombre)) LIKE '%moya%obregón%');

-- Álvaro Adolfo Labrin Decar — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='180871489';

-- Amir Antonio Bernazar Gallardo — no Martes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='242824695';

-- Arnaldo alexis Marchant Pinto — Lunes y Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='159928977';

-- Arturo Olea Reale — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='242876350';

-- Augusto Esteban Espina Oyarzun — no Lunes
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='248410795';

-- Bastian Cheuqueman Espinoza — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='224034458';

-- Benjamin Alfredo Gaete Inostroza — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='23176528K';

-- Benjamin Alonso Lobos Lizama — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237325818';

-- Benjamin ignacio Neira Becerra — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='234634070';

-- Benjamín Ignacio Caro Ramirez — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='244953107';

-- Benjamín Joel Vera Calderón — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237657128';

-- Benjamín Nicolás Arias Álamos — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='21775920K';

-- Carlos Vera Martinez — solo Lunes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='154089365';

-- Christopher David Martínez Arancibia — Lunes y Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='191858441';

-- Colomba González González — no Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='193130402';

-- Constanza Isabella Zurita Vega — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='240689464';

-- Crisse Acevedo Rios — solo Lunes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='168768028';

-- Cristian Castañeda Álvarez — solo Miércoles
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='155836148';

-- Cristóbal Alonso Zurita Vega — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='232015438';

-- Cristóbal Felipe García Arriagada — Martes y Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='224956916';

-- Cristóbal Jacobo Echeverria Jorquera — Martes y Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237876210';

-- Cristóbal Norberto Muñoz Dinamarca — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='214031213';

-- Daniel Eduardo Torres Villalobos — Lunes, Miércoles, Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='260169432';

-- David Ezequiel Corral Moya — Martes y Miércoles
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='236959546';

-- Diego Nicolás Ramírez Navarrete — Martes y Miércoles
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='24182702K';

-- Eduardo Andrés Ocares Carrasco — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='177056464';

-- Erik Rubio Rubio — Lunes, Jueves, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='212974013';

-- Facundo Alberto Gomez Retamal — entrena todos los días
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='253342013';

-- Fernando Bastias Sandoval — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='238931371';

-- Fernando Alonso Urriola Jara — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='232198133';

-- Florencia Albornoz Torres — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='236186660';

-- Francisco Javier Rivas Pino — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='243700094';

-- Franco Rencoret Cortez — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='249306878';

-- Freddy Moyano Garfias — solo Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='139313747';

-- Horacio Valentino Muñoz Morán — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='239092756';

-- Isaias esteban Aguilera Painequeo — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='227302631';

-- Isidora Teresa Gomez Retamal — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='241206157';

-- Ivan Araya Araya — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='175595740';

-- Iván Loyola Carvajal — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='208887351';

-- Javier Ignacio Curimil Rojas — solo Lunes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='157227025';

-- Jesus Enrique Colmenarez Arguello — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='252522441';

-- Joaquín Arturo Valderrama Romo — no Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='229202529';

-- Jonathan Andrés Torres Argel — Lunes, Miércoles, Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='193298303';

-- JORGE GONZALEZ NUÑEZ — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='158167093';

-- Jorge Luis Pino Campos — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='158982307';

-- José Antonio Plaza Romo — Lunes y Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='219706650';

-- José Luis Leiva Zúñiga — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237954785';

-- José tomás Sánchez Hernández — solo Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='241135292';

-- José Tomás Lopez Peys — Miércoles y Viernes (sin RUT en ref., match por nombre)
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND lower(regexp_replace(trim(nombre),'\s+',' ','g')) LIKE '%lopez%peys%';

-- Juan Carlos Kania Kuhl — solo Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='103860717';

-- Juan Carlos González Alarcón — Miércoles y Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='165830709';

-- Juan Pablo Gutierrez Alvarez — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='206309415';

-- Juan pablo Parra Gonzalez — Martes y Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='238426618';

-- Julián Agustín Troncoso Alaniz — Lunes, Martes, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='240336634';

-- Julieta Ivonne Amigo León — Lunes y Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='24663761K';

-- Karina Burgos Pavez — solo Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='192782224';

-- Lucas Michel Morales Fuentes — solo Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='244602037';

-- Lucas Simón Ruiz Soto — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='219204213';

-- Luciano Enrique Colmenarez Liendo — Lunes y Viernes (sin RUT en ref., match por nombre)
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND lower(regexp_replace(trim(nombre),'\s+',' ','g')) LIKE '%colmenarez%liendo%';

-- Martín Denzer Lira — Martes y Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='231337199';

-- Martín Gregorio Morales Moran — Lunes y Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='233318159';

-- Mateo Andrés Romero Galleguillos — Lunes, Jueves, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='249712035';

-- Mateo León Cano Espinosa — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='250671199';

-- MATIAS RIVAS — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237483561';

-- matias Guzman Escobar — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='193912994';

-- Matías Cristian Vasquez Rodríguez — Martes y Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='243891736';

-- Matías Muñoz Rojas — no Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=true,  entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='223155146';

-- Maximiliano Andrés Cabrera Levalle — Lunes, Martes, Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=true,  entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='232647795';

-- Maximiliano Joaquín Flores Alarcón — Miércoles y Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='24261156K';

-- Máximo Enrique Meirelles Bascuñán — solo Miércoles
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='242060369';

-- Mirtha Elena Schilling Varela — Lunes, Miércoles, Jueves
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='170838432';

-- Nicolás Felipe Contreras Jofré — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='196528520';

-- Nicolas Josue Diaz Balcazar — solo Viernes (nombre, RUT compartido en ref.)
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND lower(regexp_replace(trim(nombre),'\s+',' ','g')) LIKE '%diaz%balcazar%';

-- OMAR CABRERA — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='89290317';

-- Osvaldo Javier Bastias Sandoval — Lunes, Miércoles, Jueves, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='245981171';

-- Patricio Ignacio Farías Pérez — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='16962366K';

-- Randy Leonardo Rivera Morales — Martes y Miércoles
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='2405786K';

-- Renato Andrés Amigo León — Lunes y Miércoles
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='234825399';

-- Ricardo Andres Suarez Lira — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='232545658';

-- Ricardo Anibal López Araos — Lunes, Jueves, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237686004';

-- Rodrigo Sebastián Pizarro Cabello — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='180774920';

-- Ruddy Maximiliano López Morales — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='235505975';

-- Simón Andrés Luengo Gutiérrez — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='239997236';

-- Sofia Paz Salgado Gaete — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='237038983';

-- Tomas Quintana Balcazar — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='239746217';

-- Tomás Andrés Contreras Arancibia — Lunes y Viernes (sin RUT en ref., match por nombre)
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND lower(regexp_replace(trim(nombre),'\s+',' ','g')) LIKE '%contreras%arancibia%';

-- Tomas Ignacio Lopez Garrido — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='241944514';

-- Valentina Anaís Zurita Vega — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='225569568';

-- Vicente Rojas Rojas — Lunes, Miércoles, Jueves, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=true,  entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='242311493';

-- Vicente Alejandro Seguel Araya — Martes y Viernes
UPDATE jugadores SET entrena_lun=false, entrena_mar=true,  entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='227339845';

-- Vicente Ignacio González Meza — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='242829131';

-- VICTOR SOTO — solo Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='17168286';

-- Victor Rodríguez Mardones — solo Jueves
UPDATE jugadores SET entrena_lun=false, entrena_mar=false, entrena_mie=false, entrena_jue=true,  entrena_vie=false
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='87164128';

-- vilma letelier — Lunes y Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=false, entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='71723437';

-- yuri torres — Lunes, Miércoles, Viernes
UPDATE jugadores SET entrena_lun=true,  entrena_mar=false, entrena_mie=true,  entrena_jue=false, entrena_vie=true
WHERE club_id=cid AND regexp_replace(upper(rut),'[^0-9K]','','g')='109677329';

END $$;

-- Verificación: resumen por patrón de días
SELECT
  entrena_lun, entrena_mar, entrena_mie, entrena_jue, entrena_vie,
  COUNT(*) AS jugadores
FROM jugadores
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND entrena_lun IS NOT NULL
GROUP BY 1,2,3,4,5
ORDER BY jugadores DESC;
