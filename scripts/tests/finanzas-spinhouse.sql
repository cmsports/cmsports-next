-- Prueba sintética exclusiva del Postgres local creado por root. NUNCA en producción.
-- Requiere que se haya aplicado 293_finanzas_spinhouse.sql. Todo revierte al final.
BEGIN;
DO $$ BEGIN IF current_database() <> 'spinhouse_check' THEN RAISE EXCEPTION 'Solo se permite spinhouse_check local'; END IF; END $$;
CREATE FUNCTION pg_temp.assert_raises(p_sql text, p_message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_message text; BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT; END;
  IF v_message IS NULL OR position(p_message IN v_message) = 0 THEN RAISE EXCEPTION 'No se rechazó correctamente: %, mensaje: %',p_sql,v_message; END IF;
END $$;
-- Requiere el RPC financiero real de258 y sus helpers de039 cargados por root.
INSERT INTO auth.users(id) VALUES('d1111111-1111-4111-8111-111111111111'),('d2222222-2222-4222-8222-222222222222');
INSERT INTO perfiles(id,club_id,rol,nombre) VALUES
 ('d1111111-1111-4111-8111-111111111111','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','admin','Admin prueba'),
 ('d2222222-2222-4222-8222-222222222222','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','admin','Otro club');
INSERT INTO profesores(id,club_id,nombre) VALUES
 ('d3333333-3333-4333-8333-333333333333','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Entrenadora prueba'),
 ('d4444444-4444-4444-8444-444444444444','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','Profesora otro club');
INSERT INTO bloques_horario(id,club_id,nombre,hora_inicio,hora_fin,tipo_clase) VALUES
 ('d5555555-5555-4555-8555-555555555555','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Grupo prueba','17:00','18:30','adultos'),
 ('d6666666-6666-4666-8666-666666666666','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','Otro grupo','17:00','18:00','grupal');
INSERT INTO bloque_profesores(bloque_id,profesor_id,rol) VALUES('d5555555-5555-4555-8555-555555555555','d3333333-3333-4333-8333-333333333333','principal');
SELECT set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
SELECT spinhouse_finanzas_tarifa('d3333333-3333-4333-8333-333333333333','adultos','principal','2026-01-01',20000);
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_tarifa('d4444444-4444-4444-8444-444444444444','adultos','principal','2026-01-01',1)$q$,'fuera del club');
INSERT INTO asistencia_profesores(id,club_id,profesor_id,bloque_id,fecha) VALUES
 ('d7777777-7777-4777-8777-777777777777','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','d3333333-3333-4333-8333-333333333333','d5555555-5555-4555-8555-555555555555',(now() AT TIME ZONE 'America/Santiago')::date),
 ('d8888888-8888-4888-8888-888888888888','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','d3333333-3333-4333-8333-333333333333','d5555555-5555-4555-8555-555555555555','2026-01-05');
UPDATE bloques_horario SET se_cobra_aparte=true WHERE id='d5555555-5555-4555-8555-555555555555';
UPDATE bloques_horario SET hora_fin='20:00' WHERE id='d5555555-5555-4555-8555-555555555555';
DO $$ BEGIN
 IF (SELECT minutos FROM spinhouse_finanzas_horas WHERE asistencia_id='d7777777-7777-4777-8777-777777777777') <> 90 THEN RAISE EXCEPTION 'El horario cambió los minutos congelados'; END IF;
 IF (SELECT se_cobra_aparte FROM spinhouse_finanzas_horas WHERE asistencia_id='d7777777-7777-4777-8777-777777777777') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Cambió modalidad de cobro congelada'; END IF;
 IF EXISTS (SELECT 1 FROM spinhouse_finanzas_horas WHERE asistencia_id='d8888888-8888-4888-8888-888888888888') THEN RAISE EXCEPTION 'Se inventaron minutos históricos'; END IF;
END $$;
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_liquidar('d3333333-3333-4333-8333-333333333333',1,2026)$q$,'Falta confirmar');
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_confirmar_horas('d8888888-8888-4888-8888-888888888888',90,'adultos','principal',NULL)$q$,'Confirma si');
SELECT spinhouse_finanzas_confirmar_horas('d8888888-8888-4888-8888-888888888888',90,'adultos','principal',false);
SELECT spinhouse_finanzas_liquidar('d3333333-3333-4333-8333-333333333333',1,2026);
SELECT spinhouse_finanzas_liquidar('d3333333-3333-4333-8333-333333333333',1,2026);
SELECT spinhouse_finanzas_tarifa('d3333333-3333-4333-8333-333333333333','adultos','principal','2026-01-01',90000);
DO $$ BEGIN
 IF (SELECT total FROM spinhouse_finanzas_liquidaciones WHERE profesor_id='d3333333-3333-4333-8333-333333333333' AND mes=1 AND anio=2026) <> 30000 THEN RAISE EXCEPTION 'Se recalculó una liquidación cerrada'; END IF;
 IF (SELECT count(*) FROM movimientos WHERE profesor_id='d3333333-3333-4333-8333-333333333333' AND mes_correspondiente=1 AND anio_correspondiente=2026) <> 1 THEN RAISE EXCEPTION 'Se duplicó gasto al reintentar'; END IF;
END $$;
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_confirmar_horas('d8888888-8888-4888-8888-888888888888',180,'adultos','principal',false)$q$,'ya está liquidado');
SELECT pg_temp.assert_raises($q$DELETE FROM asistencia_profesores WHERE id='d8888888-8888-4888-8888-888888888888'$q$,'liquidación cerrada');
SELECT pg_temp.assert_raises($q$UPDATE movimientos SET monto=1 WHERE profesor_id='d3333333-3333-4333-8333-333333333333' AND mes_correspondiente=1$q$,'liquidación cerrada');
SELECT pg_temp.assert_raises($q$INSERT INTO asistencia_profesores(club_id,profesor_id,bloque_id,fecha) VALUES('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','d3333333-3333-4333-8333-333333333333','d5555555-5555-4555-8555-555555555555','2026-01-06')$q$,'ya está liquidado');
-- Asignar un bloque no convierte la categoría mensualidad en una modalidad.
INSERT INTO movimientos(id,club_id,tipo,categoria,monto,fecha) VALUES('dccccccc-cccc-4ccc-8ccc-cccccccccccc','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','ingreso','mensualidad',30000,'2026-01-05');
SELECT spinhouse_finanzas_asignar('dccccccc-cccc-4ccc-8ccc-cccccccccccc','d5555555-5555-4555-8555-555555555555');
DO $$ BEGIN IF (SELECT linea FROM spinhouse_finanzas_asignaciones WHERE movimiento_id='dccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 'mensualidad' THEN RAISE EXCEPTION 'Asignar bloque reclasificó el ingreso'; END IF; END $$;
-- Una marca sin snapshot en un mes abierto tampoco puede trasladarse al cerrado.
INSERT INTO asistencia_profesores(id,club_id,profesor_id,bloque_id,fecha) VALUES('d9999999-9999-4999-8999-999999999999','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','d3333333-3333-4333-8333-333333333333','d5555555-5555-4555-8555-555555555555','2026-02-05');
SELECT pg_temp.assert_raises($q$UPDATE asistencia_profesores SET fecha='2026-01-07' WHERE id='d9999999-9999-4999-8999-999999999999'$q$,'destino');
-- También rechaza el traslado desde otro entrenador hacia uno ya liquidado.
INSERT INTO profesores(id,club_id,nombre) VALUES('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Entrenador sin liquidación');
INSERT INTO asistencia_profesores(id,club_id,profesor_id,bloque_id,fecha) VALUES('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d5555555-5555-4555-8555-555555555555','2026-01-08');
SELECT pg_temp.assert_raises($q$UPDATE asistencia_profesores SET profesor_id='d3333333-3333-4333-8333-333333333333' WHERE id='dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$q$,'destino');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND relation IN ('asistencia_profesores'::regclass,'spinhouse_finanzas_horas'::regclass,'spinhouse_finanzas_tarifas'::regclass) AND mode='ShareLock') THEN RAISE EXCEPTION 'La liquidación bloqueó una tabla compartida'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','d2222222-2222-4222-8222-222222222222',true);
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_datos(1,2026)$q$,'no habilitadas');
INSERT INTO asistencia_profesores(club_id,profesor_id,bloque_id,fecha) VALUES('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','d4444444-4444-4444-8444-444444444444','d6666666-6666-4666-8666-666666666666',(now() AT TIME ZONE 'America/Santiago')::date);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM spinhouse_finanzas_horas WHERE club_id='ec1ef215-0ab5-43c6-abf4-fc5578b17bcc') THEN RAISE EXCEPTION 'Se modificó el otro club'; END IF; END $$;
ROLLBACK;
