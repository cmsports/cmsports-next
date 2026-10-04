BEGIN;
DO $$ BEGIN IF current_database() <> 'spinhouse_check' THEN RAISE EXCEPTION 'Solo base LOCAL spinhouse_check'; END IF; END $$;
CREATE FUNCTION pg_temp.assert_true(p_ok boolean,p_mensaje text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fallo: %',p_mensaje; END IF; END $$;
CREATE FUNCTION pg_temp.assert_raises(p_sql text,p_fragmento text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE m text; BEGIN BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS m=MESSAGE_TEXT; END; IF m IS NULL OR position(p_fragmento in m)=0 THEN RAISE EXCEPTION 'No rechazó %: %',p_sql,m; END IF; END $$;
INSERT INTO perfiles(id,club_id,rol,nombre,email) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','admin','Admin Sintético','sintetico@example.test'),
 ('aaaaaaaa-0000-4000-8000-000000000002','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','admin','Otro Admin Sintético','otro@example.test');
INSERT INTO jugadores(id,club_id,nombre,estado,es_externo,creado_en,fecha_nacimiento) VALUES
 ('bbbbbbbb-0000-4000-8000-000000000001','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Menor Prueba','activo',false,now()-interval '100 days',current_date-interval '12 years'),
 ('bbbbbbbb-0000-4000-8000-000000000002','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','Otro Club Prueba','activo',false,now()-interval '100 days',current_date-interval '25 years'),
 ('bbbbbbbb-0000-4000-8000-000000000003','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Sin Movimiento Prueba','activo',false,now()-interval '100 days',current_date-interval '25 years'),
 ('bbbbbbbb-0000-4000-8000-000000000004','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Bloqueo Manual Prueba','bloqueado',false,now(),current_date-interval '25 years');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_raises($q$SELECT guardar_ficha_paralimpica('bbbbbbbb-0000-4000-8000-000000000001','sentado',3,'Acceso prueba')$q$,'consentimiento');
SELECT pg_temp.assert_raises($q$SELECT registrar_consentimiento_salud('bbbbbbbb-0000-4000-8000-000000000001',true,(now() AT TIME ZONE 'America/Santiago')::date,'jugador','Alumno Prueba','Respaldo sintético')$q$,'apoderado');
SELECT registrar_consentimiento_salud('bbbbbbbb-0000-4000-8000-000000000001',true,(now() AT TIME ZONE 'America/Santiago')::date,'apoderado','Apoderado Prueba','Respaldo sintético');
SELECT guardar_ficha_paralimpica('bbbbbbbb-0000-4000-8000-000000000001','sentado',3,'Acceso prueba');
SELECT pg_temp.assert_raises($q$SELECT guardar_ficha_paralimpica('bbbbbbbb-0000-4000-8000-000000000001','sentado',9,'Acceso prueba')$q$,'check constraint');
SELECT registrar_consentimiento_salud('bbbbbbbb-0000-4000-8000-000000000001',false,(now() AT TIME ZONE 'America/Santiago')::date,'apoderado','Apoderado Prueba','Revocación sintética');
SELECT pg_temp.assert_raises($q$SELECT guardar_ficha_paralimpica('bbbbbbbb-0000-4000-8000-000000000001','sentado',3,'Acceso prueba')$q$,'consentimiento');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM jugador_ficha_paralimpica),'Staff no ve salud revocada');
RESET ROLE;
SELECT registrar_permanencia_jugador('bbbbbbbb-0000-4000-8000-000000000003','retiro',(now() AT TIME ZONE 'America/Santiago')::date,'Retiro sintético');
SELECT pg_temp.assert_true((SELECT inactivo AND retirado_manual FROM retencion_estado WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000003'),'Retiro fuera de padrón');
SELECT registrar_permanencia_jugador('bbbbbbbb-0000-4000-8000-000000000003','reingreso',(now() AT TIME ZONE 'America/Santiago')::date,'Regreso sintético');
SELECT pg_temp.assert_true((SELECT NOT inactivo FROM retencion_estado WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000003'),'Reingreso vigente');
SELECT guardar_calendario_actividad(NULL,jsonb_build_object('titulo','Torneo prueba','tipo','externo','fecha',(now() AT TIME ZONE 'America/Santiago')::date,'publico',true,'descripcion','Detalle privado sintético'),ARRAY['bbbbbbbb-0000-4000-8000-000000000001'::uuid]);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM calendario_publico('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41',(now() AT TIME ZONE 'America/Santiago')::date,(now() AT TIME ZONE 'America/Santiago')::date)),'Calendario público autorizado');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM calendario_publico('ec1ef215-0ab5-43c6-abf4-fc5578b17bcc',current_date,current_date)),'Otro club sin agenda nueva');
SELECT pg_temp.assert_raises($q$SELECT guardar_calendario_actividad(NULL,jsonb_build_object('titulo','Mal prueba','tipo','externo','fecha',current_date,'publico',true),ARRAY['bbbbbbbb-0000-4000-8000-000000000002'::uuid])$q$,'club');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_raises($q$SELECT guardar_ficha_paralimpica('bbbbbbbb-0000-4000-8000-000000000002','de_pie',8,'Acceso prueba')$q$,'Acceso');
SELECT pg_temp.assert_raises($q$SELECT registrar_permanencia_jugador('bbbbbbbb-0000-4000-8000-000000000002','retiro',current_date,'Retiro sintético')$q$,'no habilitado');
SELECT pg_temp.assert_raises($q$SELECT spinhouse_finanzas_datos(10,2026)$q$,'no habilitadas');
SELECT pg_temp.assert_true((SELECT NOT modulos_habilitados && ARRAY['finanzas_spinhouse','retencion_automatica','calendario_integrado','ficha_paralimpica','exportacion_partidos','indicador_bajas_club'] FROM clubes WHERE nombre='Asociación TDM Buin y Paine'),'Módulos otros clubes intactos');
ROLLBACK;
