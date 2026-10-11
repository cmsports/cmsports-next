INSERT INTO torneos(id,club_id,nombre,cuota_inscripcion) VALUES
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Torneo simulado',3000);
INSERT INTO torneo_pagos(torneo_id,jugador_id,estado,metodo_pago) VALUES
 ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),'pagado','efectivo'),
 ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),'pagado','transferencia'),
 ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),'pendiente',NULL),
 ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),'exento',NULL);
SELECT comprobar(subir_pagos_torneo_a_finanzas_atomico('00000000-0000-4000-8000-000000000003',NULL,'00000000-0000-4000-8000-000000000004') = '{"cantidad":2,"monto":6000}'::jsonb,'Traspaso inicial incorrecto');
SELECT comprobar((SELECT count(*)=2 AND sum(monto)=6000 FROM movimientos),'Efectivo y transferencia incorrectos');
SELECT comprobar((SELECT count(*)=2 FROM torneo_pagos WHERE subido_a_finanzas),'Marcó pendientes o exentos');
SELECT comprobar(subir_pagos_torneo_a_finanzas_atomico('00000000-0000-4000-8000-000000000003',NULL,'00000000-0000-4000-8000-000000000004') = '{"cantidad":2,"monto":6000}'::jsonb,'Reintento no idempotente');
SELECT comprobar((SELECT count(*)=2 FROM movimientos),'Duplicó ingresos');
SELECT debe_fallar($q$UPDATE torneo_pagos SET estado='pendiente' WHERE subido_a_finanzas$q$,'Permitió desmarcar pagos contabilizados');
SELECT debe_fallar($q$UPDATE torneo_pagos SET metodo_pago='transferencia' WHERE subido_a_finanzas AND metodo_pago='efectivo'$q$,'Permitió cambiar método contabilizado');
UPDATE torneo_pagos SET estado='pagado',metodo_pago='efectivo' WHERE estado='pendiente';
SELECT comprobar(subir_pagos_torneo_a_finanzas_atomico('00000000-0000-4000-8000-000000000003',NULL,gen_random_uuid()) = '{"cantidad":1,"monto":3000}'::jsonb,'No sube solamente pagos nuevos');
SELECT comprobar((SELECT sum(monto)=9000 FROM movimientos WHERE tipo='ingreso'),'Total ingresos incorrecto');
SELECT debe_fallar($q$SELECT subir_pagos_torneo_a_finanzas_atomico('00000000-0000-4000-8000-000000000099',NULL,gen_random_uuid())$q$,'Aceptó torneo ajeno/inexistente');
SELECT guardar_premios_torneo_atomico('00000000-0000-4000-8000-000000000003','Torneo simulado',1000,500,NULL,'efectivo','[]','00000000-0000-4000-8000-000000000005',NULL);
SELECT guardar_premios_torneo_atomico('00000000-0000-4000-8000-000000000003','Torneo simulado',1000,500,NULL,'efectivo','[]','00000000-0000-4000-8000-000000000005',NULL);
SELECT comprobar((SELECT count(*)=2 AND sum(monto)=1500 FROM movimientos WHERE categoria='premio_torneo'),'Reintento duplicó premios');
SELECT debe_fallar($q$SELECT guardar_premios_torneo_atomico('00000000-0000-4000-8000-000000000003','Torneo simulado',1000,500,NULL,'efectivo','[]',gen_random_uuid(),NULL)$q$,'Otra pestaña duplicó los premios');
SELECT comprobar((SELECT count(*)=2 FROM movimientos WHERE categoria='premio_torneo'),'Premios duplicados tras error');
SELECT registrar_gastos_gestion_torneo_atomico('00000000-0000-4000-8000-000000000003','Torneo simulado','[{"tipo":"Arbitraje","monto":800}]','00000000-0000-4000-8000-000000000006');
SELECT registrar_gastos_gestion_torneo_atomico('00000000-0000-4000-8000-000000000003','Torneo simulado','[{"tipo":"Arbitraje","monto":800}]','00000000-0000-4000-8000-000000000006');
SELECT comprobar((SELECT sum(monto)=800 FROM movimientos WHERE categoria='otro_gasto'),'Gastos duplicados');
SELECT comprobar((SELECT premio_primero=1000 AND premio_segundo=500 FROM torneos),'Los gastos pisaron premios');
SELECT comprobar((SELECT bool_and(fecha=(now() AT TIME ZONE 'America/Santiago')::date) FROM movimientos),'Fecha contable incorrecta');
