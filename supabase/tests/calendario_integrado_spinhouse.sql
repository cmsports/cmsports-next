-- Regresión de calendario: ejecutar SOLO en la base de validación local,
-- después de 295. Todas las filas sintéticas se revierten al finalizar.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'spinhouse_check' THEN
    RAISE EXCEPTION 'Esta prueba solo admite la base LOCAL spinhouse_check';
  END IF;
END $$;

DO $$
DECLARE v_club uuid; v_otro uuid; v_json jsonb; v_count integer;
BEGIN
  SELECT c.id INTO STRICT v_club FROM public.clubes c WHERE c.nombre='Spinhouse';
  PERFORM set_config('cmsports.test_spinhouse_id',v_club::text,true);
  SELECT c.id INTO STRICT v_otro FROM public.clubes c WHERE c.nombre='Asociación TDM Buin y Paine';
  INSERT INTO public.calendario_actividades(id,club_id,titulo,tipo,fecha,lugar,descripcion,publico) VALUES
    ('cccccccc-0000-4000-8000-000000000001',v_club,'Actividad pública sintética','externo','2099-10-01','Sede pública','Dato privado sintético',true),
    ('cccccccc-0000-4000-8000-000000000002',v_club,'Actividad interna sintética','reunion','2099-10-02','Lugar interno','Detalle interno',false);

  INSERT INTO public.jugadores(id,club_id,nombre,estado,es_externo) VALUES ('cccccccc-0000-4000-8000-000000000003',v_club,'Alumno sintético','activo',false);
  INSERT INTO public.calendario_nomina(actividad_id,club_id,jugador_id) VALUES ('cccccccc-0000-4000-8000-000000000001',v_club,'cccccccc-0000-4000-8000-000000000003');
  DELETE FROM public.jugadores WHERE id='cccccccc-0000-4000-8000-000000000003' AND club_id=v_club;
  IF EXISTS (SELECT 1 FROM public.calendario_nomina WHERE jugador_id='cccccccc-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'El borrado dejó una convocatoria huérfana'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.calendario_actividades WHERE id='cccccccc-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Borrar al jugador eliminó el evento'; END IF;

  -- Invocar la función obliga a ejecutar el IF de autorización y la consulta
  -- de proyección: detecta el conflicto entre RETURNS TABLE(id,...) y clubes.id.
  SELECT to_jsonb(a) INTO STRICT v_json FROM public.calendario_publico(v_club,'2099-10-01','2099-10-02') a
    WHERE a.id='cccccccc-0000-4000-8000-000000000001';
  IF v_json ? 'descripcion' OR v_json ? 'jugador_id' OR v_json ? 'nomina' OR v_json::text LIKE '%Dato privado%' THEN
    RAISE EXCEPTION 'La proyección pública filtró datos privados';
  END IF;
  IF v_json->>'titulo' <> 'Actividad pública sintética' THEN RAISE EXCEPTION 'Proyección pública incorrecta'; END IF;
  SELECT count(*) INTO v_count FROM public.calendario_publico(v_club,'2099-10-01','2099-10-02') a
    WHERE a.id='cccccccc-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Se publicó una actividad interna'; END IF;
  SELECT count(*) INTO v_count FROM public.calendario_publico(v_otro,'2099-10-01','2099-10-02');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Se habilitó la agenda de otro club'; END IF;
  SELECT count(*) INTO v_count FROM public.calendario_publico(v_club,'2099-10-02','2099-10-01');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Se aceptó un rango invertido'; END IF;
  SELECT count(*) INTO v_count FROM public.calendario_publico(v_club,'2099-10-01','2100-10-01');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Se aceptó un rango excesivo'; END IF;
END $$;

-- El visitante accede a la proyección aun sin autenticación, nunca a tablas.
SET LOCAL ROLE anon;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.calendario_publico(
    current_setting('cmsports.test_spinhouse_id')::uuid,'2099-10-01','2099-10-02') a
    WHERE a.id='cccccccc-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'El visitante no puede leer la agenda pública de Spinhouse'; END IF;
  BEGIN
    PERFORM 1 FROM public.calendario_nomina LIMIT 1;
    RAISE EXCEPTION 'El visitante tiene acceso directo a nóminas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
