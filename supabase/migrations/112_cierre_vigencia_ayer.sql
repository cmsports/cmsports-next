-- Cerrar una vigencia con la fecha de hoy no saca a nadie.
--
-- `vigente_hasta` es el ÚLTIMO DÍA EN QUE VALE. Así lo dice la 086 y así lo lee
-- todo el sistema (`vigente_hasta >= fecha`). Pero el código escribía la fecha
-- de HOY al cerrar, o sea "vale hasta hoy inclusive": sacar a alguien de un
-- grupo no lo sacaba hasta la medianoche.
--
--   · A Sofía la sacaron de sus dos bloques. La ficha y los cupos —que
--     preguntan por `vigente_hasta is null`— la dieron por fuera al toque. La
--     lista de asistencia —que pregunta por `vigente_hasta >= fecha`— la siguió
--     mostrando en su horario viejo, y dejaba marcarle presente en un grupo al
--     que ya no pertenece.
--
--   · Al que le cambian de horario o de sede queda en LOS DOS bloques ese día:
--     el viejo cerrado hoy sigue vigente hoy, y el nuevo abre hoy. Un cupo en
--     cada uno. Al correr esto había 10 jugadores así.
--
-- El código ya quedó cerrando con el día anterior (`cierreVigencia`). Esto
-- corrige las filas que se escribieron antes del arreglo.
--
-- Se corrigen TODAS las cerradas, no solo las de hoy: son 37 en total y las 37
-- salieron del mismo código, todas con un día de más. Dejar las viejas a medias
-- sería convivir con dos convenciones en la misma columna.
--
-- Seis de ellas quedan con vigente_hasta < vigente_desde. No es un error: son
-- inscripciones creadas y cerradas el mismo día, o sea gente que nunca llegó a
-- pertenecer al bloque. Un intervalo vacío es exactamente eso, y `vigenteEn`
-- lo resuelve en false para cualquier fecha.

begin;

-- Las inscripciones a bloques: el caso de Sofía y los otros 12.
update bloque_jugadores
   set vigente_hasta = vigente_hasta - 1
 where vigente_hasta is not null;

-- Los profesores reasignados, que quedaban dictando dos grupos a la vez.
update bloque_profesores
   set vigente_hasta = vigente_hasta - 1
 where vigente_hasta is not null;

-- Los bloques dados de baja. Hoy no hay ninguno cerrado, pero la columna se
-- escribe desde el mismo código y mañana sí puede haberlos.
update bloques_horario
   set vigente_hasta = vigente_hasta - 1
 where vigente_hasta is not null;

commit;

-- Verificación: después de correrla, las tres cuentas tienen que dar 0.
--
--   select 'bloque_jugadores' as tabla, count(*) as aun_vigentes
--     from bloque_jugadores
--    where vigente_hasta >= timezone('America/Santiago', now())::date
--   union all
--   select 'bloque_profesores', count(*) from bloque_profesores
--    where vigente_hasta >= timezone('America/Santiago', now())::date
--   union all
--   select 'bloques_horario', count(*) from bloques_horario
--    where vigente_hasta >= timezone('America/Santiago', now())::date;
