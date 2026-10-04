-- Prueba SOLO local sobre bootstrap SQL del proyecto (spinhouse_check).
-- La metadata de ese fixture omite el índice parcial de cuotas que sí existe
-- en producción. Se repone aquí dentro de la transacción y se revierte todo.
BEGIN;
DO $$ BEGIN IF current_database()<>'spinhouse_check' THEN RAISE EXCEPTION 'Solo base local'; END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fixture_mensualidades_club_jugador_mes ON mensualidades(club_id,jugador_id,mes,anio) WHERE club_id IS NOT NULL AND jugador_id IS NOT NULL;
CREATE FUNCTION pg_temp.ok(p boolean,m text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF p IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fallo: %',m; END IF; END$$;
CREATE FUNCTION pg_temp.rechaza(q text,m text) RETURNS void LANGUAGE plpgsql AS $$DECLARE e text;BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e=MESSAGE_TEXT; END; IF e IS NULL OR position(m IN e)=0 THEN RAISE EXCEPTION 'No rechazó %: %',q,e; END IF;END$$;
INSERT INTO perfiles(id,club_id,rol,nombre,email) VALUES('aaaaaaaa-0000-4000-8000-000000000010','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','admin','Retención Test','r@example.test');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000010',true);
INSERT INTO jugadores(id,club_id,nombre,estado,es_externo,creado_en,mensualidad) VALUES
('bbbbbbbb-0000-4000-8000-000000000010','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','DeudorTest','activo',false,now()-interval '100days',10000),
('bbbbbbbb-0000-4000-8000-000000000011','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','InactivoTest','activo',false,now()-interval '100days',10000),
('bbbbbbbb-0000-4000-8000-000000000012','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','ManualTest','bloqueado',false,now(),10000),
('bbbbbbbb-0000-4000-8000-000000000013','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','FaltasTest','activo',false,now(),10000),
('bbbbbbbb-0000-4000-8000-000000000014','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','OtroTest','activo',false,now()-interval '100days',10000);
INSERT INTO mensualidades(club_id,jugador_id,mes,anio,monto,estado) SELECT club_id,id,extract(month FROM (now() AT TIME ZONE 'America/Santiago')::date-70)::int,extract(year FROM (now() AT TIME ZONE 'America/Santiago')::date-70)::int,10000,'pendiente' FROM jugadores WHERE id IN ('bbbbbbbb-0000-4000-8000-000000000010','bbbbbbbb-0000-4000-8000-000000000014');
INSERT INTO asistencia(club_id,jugador_id,fecha,estado) VALUES
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000010',(now() AT TIME ZONE 'America/Santiago')::date,'presente'),
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000013',(now() AT TIME ZONE 'America/Santiago')::date-3,'ausente'),
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000013',(now() AT TIME ZONE 'America/Santiago')::date-2,'ausente'),
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000013',(now() AT TIME ZONE 'America/Santiago')::date-1,'ausente');
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT estado='activo' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000010'),'Modo revisión no bloquea');
SELECT pg_temp.ok((SELECT NOT inactivo FROM retencion_estado WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000011'),'Modo revisión no inactiva');
SELECT pg_temp.ok((SELECT count(*)=2 FROM retencion_alertas WHERE jugador_id IN ('bbbbbbbb-0000-4000-8000-000000000010','bbbbbbbb-0000-4000-8000-000000000013') AND resuelta_en IS NULL),'Avisos de deuda y faltas persistidos');
SELECT pg_temp.rechaza('SELECT activar_retencion_club(true)','30 días');
SELECT pg_temp.rechaza('UPDATE club_config SET valor=''"si"''::jsonb WHERE clave=''retencion.automatismo'' AND club_id=''2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41''','30 días');
UPDATE retencion_control SET preparacion_en=now()-interval '31 days' WHERE club_id='2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
SELECT pg_temp.rechaza('SELECT activar_retencion_club(false)','Confirma');
SELECT activar_retencion_club(true);
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT estado='bloqueado' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000010'),'Deuda bloquea');
SELECT pg_temp.ok((SELECT inactivo FROM retencion_estado WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000011'),'Sin señales60d inactivo');
SELECT pg_temp.ok((SELECT estado='activo' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000011'),'Inactividad no bloquea');
SELECT pg_temp.ok((SELECT estado='activo' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000013'),'Faltas no bloquean');
SELECT pg_temp.ok((SELECT estado='bloqueado' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000012'),'Bloqueo manual preservado');
SELECT pg_temp.ok((SELECT estado='activo' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000014'),'Otro club intacto');
CREATE TEMP TABLE foto_eventos AS SELECT count(*) n FROM retencion_eventos;
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT count(*)=(SELECT n FROM foto_eventos) FROM retencion_eventos),'Ejecución repetida idempotente');
SELECT generar_mensualidades_jugadores_seguro(ARRAY['bbbbbbbb-0000-4000-8000-000000000011'::uuid],extract(month FROM (now() AT TIME ZONE 'America/Santiago')::date)::int,extract(year FROM (now() AT TIME ZONE 'America/Santiago')::date)::int);
SELECT pg_temp.ok((SELECT count(*)=0 FROM mensualidades WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000011'),'Cuota manual no se emite inactivo');
SELECT emitir_mensualidades_mes_actual('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41');
SELECT pg_temp.ok((SELECT count(*)=0 FROM mensualidades WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000011'),'Cuota automática no se emite inactivo');
SELECT pg_temp.ok((dashboard_kpis('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41')->>'jugadores_activos')::int=1,'Padrón KPI excluye inactivos');
-- Un pago regulariza el bloqueo automático, pero el admin puede hacerlo manual.
UPDATE jugadores SET estado='bloqueado' WHERE id='bbbbbbbb-0000-4000-8000-000000000010';
UPDATE mensualidades SET estado='pagado',fecha_pago=(now() AT TIME ZONE 'America/Santiago')::date WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000010';
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT estado='bloqueado' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000010'),'Reafirmación manual no se desbloquea al pagar');
SELECT pg_temp.ok((SELECT count(*)=0 FROM retencion_alertas WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000010' AND tipo='deuda' AND resuelta_en IS NULL),'Pago resuelve aviso deuda');
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_log WHERE entity_type='retencion' AND entity_id='bbbbbbbb-0000-4000-8000-000000000010'),'Auditoría cambios');

-- Regularizar un bloqueo cuyo origen sigue siendo automático sí lo libera.
INSERT INTO jugadores(id,club_id,nombre,estado,es_externo,creado_en,mensualidad)
 VALUES('bbbbbbbb-0000-4000-8000-000000000015','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','PagoAutoTest','activo',false,now(),10000);
INSERT INTO mensualidades(club_id,jugador_id,mes,anio,monto,estado)
 SELECT '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000015',extract(month FROM (now() AT TIME ZONE 'America/Santiago')::date-70)::int,extract(year FROM (now() AT TIME ZONE 'America/Santiago')::date-70)::int,10000,'pendiente';
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT bloqueado_por_mora FROM retencion_estado WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000015'),'Origen automático identificado');
UPDATE mensualidades SET estado='pagado',fecha_pago=(now() AT TIME ZONE 'America/Santiago')::date WHERE jugador_id='bbbbbbbb-0000-4000-8000-000000000015';
SELECT ejecutar_retencion_club();
SELECT pg_temp.ok((SELECT estado='activo' FROM jugadores WHERE id='bbbbbbbb-0000-4000-8000-000000000015'),'Pago desbloquea solo origen automático');
-- El jugador solo lee su aviso; tampoco ejecuta ni escribe el motor.
INSERT INTO perfiles(id,club_id,rol,jugador_id,nombre,email) VALUES('aaaaaaaa-0000-4000-8000-000000000015','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','jugador','bbbbbbbb-0000-4000-8000-000000000015','Jugador Test','j@example.test');
INSERT INTO retencion_alertas(club_id,jugador_id,tipo,mensaje) VALUES
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000015','deuda','Prueba aviso propio'),
('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','bbbbbbbb-0000-4000-8000-000000000012','deuda','Prueba aviso otro');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000015',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*)=1 FROM retencion_alertas WHERE resuelta_en IS NULL),'RLS aviso propio');
SELECT pg_temp.rechaza('SELECT ejecutar_retencion_club()','Acceso denegado');
SELECT pg_temp.rechaza('SELECT _procesar_retencion_club(''2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41''::uuid)','permission denied');
SELECT pg_temp.rechaza('UPDATE retencion_estado SET inactivo=false','permission denied');
RESET ROLE;

ROLLBACK;
