-- Prueba de parciales nuevos y correcciones. Solo Postgres LOCAL; revierte todo.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'spinhouse_check' THEN RAISE EXCEPTION 'Solo base LOCAL spinhouse_check'; END IF;
END $$;
INSERT INTO public.jugadores(id,club_id,nombre) VALUES
 ('eeeeeeee-0000-4000-8000-000000000005','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Jugador A prueba'),
 ('eeeeeeee-0000-4000-8000-000000000006','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Jugador B prueba');
INSERT INTO public.torneos(id,club_id,nombre) VALUES
 ('eeeeeeee-0000-4000-8000-000000000001','2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41','Exportación prueba'),
 ('eeeeeeee-0000-4000-8000-000000000002','ec1ef215-0ab5-43c6-abf4-fc5578b17bcc','Otro club prueba');
INSERT INTO public.torneo_partidos(id,torneo_id,jugador_a,jugador_b,ganador,sets_a,sets_b,puntos_a,puntos_b,parciales) VALUES
 ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 ('eeeeeeee-0000-4000-8000-000000000004','eeeeeeee-0000-4000-8000-000000000002',NULL,NULL,NULL,3,0,33,0,'[[11,0],[11,0],[11,0]]');
-- Un resultado anterior sin detalle sigue sin parciales: no se inventan.
DO $$ BEGIN
 IF (SELECT parciales IS NOT NULL FROM torneo_partidos WHERE id='eeeeeeee-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Se inventaron parciales'; END IF;
END $$;
UPDATE public.torneo_partidos SET jugador_a='eeeeeeee-0000-4000-8000-000000000005',jugador_b='eeeeeeee-0000-4000-8000-000000000006',ganador='eeeeeeee-0000-4000-8000-000000000005',sets_a=3,sets_b=0,puntos_a=33,puntos_b=24,parciales='[[11,9],[11,7],[11,8]]'
 WHERE id='eeeeeeee-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT parciales IS DISTINCT FROM '[[11,9],[11,7],[11,8]]'::jsonb FROM torneo_partidos WHERE id='eeeeeeee-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'No conservó parciales registrados con el resultado'; END IF;
END $$;
UPDATE public.torneo_partidos SET sets_a=2,sets_b=3,ganador='eeeeeeee-0000-4000-8000-000000000006' WHERE id='eeeeeeee-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT parciales IS NOT NULL FROM torneo_partidos WHERE id='eeeeeeee-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Conservó parciales obsoletos tras corregir resultado'; END IF;
END $$;
-- El trigger evita conservar parciales de un resultado que ya fue retrocedido.
UPDATE public.torneo_partidos SET ganador=NULL,parciales='[[11,9],[11,7],[11,8]]',sets_a=3,sets_b=0 WHERE id='eeeeeeee-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT parciales IS NOT NULL FROM torneo_partidos WHERE id='eeeeeeee-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Parciales sin resultado vigente'; END IF;
END $$;
-- El mismo trigger permanece inerte para los demás clubes.
UPDATE public.torneo_partidos SET sets_a=0,sets_b=3,puntos_a=0,puntos_b=33 WHERE id='eeeeeeee-0000-4000-8000-000000000004';
DO $$ BEGIN
 IF (SELECT parciales IS DISTINCT FROM '[[11,0],[11,0],[11,0]]'::jsonb FROM torneo_partidos WHERE id='eeeeeeee-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'El trigger alteró otro club'; END IF;
END $$;
ROLLBACK;
