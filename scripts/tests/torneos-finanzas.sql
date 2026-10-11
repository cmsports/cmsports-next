-- Solo fixtures en PostgreSQL desechable. El runner carga los RPC reales.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE TABLE perfiles(id uuid, club_id uuid, nombre text, rol text);
INSERT INTO perfiles VALUES (auth.uid(), '00000000-0000-4000-8000-000000000002', 'Admin de prueba', 'admin');
CREATE TABLE torneos(id uuid PRIMARY KEY, club_id uuid, nombre text, cuota_inscripcion integer,
  contabilidad_enviada boolean DEFAULT false, premio_primero integer, premio_segundo integer,
  premio_tercero integer, premio_consuelo integer);
CREATE TABLE torneo_pagos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), torneo_id uuid REFERENCES torneos,
  jugador_id uuid, estado text, metodo_pago text, fecha_pago date, subido_a_finanzas boolean DEFAULT false,
  UNIQUE(torneo_id,jugador_id));
CREATE TABLE movimientos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid, torneo_id uuid,
  tipo text, categoria text, descripcion text, monto integer CHECK(monto>0), fecha date, registrado_por_nombre text);
CREATE TABLE finanzas_operaciones(club_id uuid, clave uuid, operacion text, resultado jsonb, usuario_id uuid,
  PRIMARY KEY(club_id,clave));
CREATE TABLE migraciones_prueba(nombre text PRIMARY KEY);
CREATE FUNCTION _migracion_nueva(n text) RETURNS void LANGUAGE sql AS $$ INSERT INTO migraciones_prueba VALUES(n) $$;
CREATE FUNCTION _migracion_para_todos_los_clubes(motivo text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION comprobar(ok boolean, mensaje text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', mensaje; END IF; END $$;
CREATE FUNCTION debe_fallar(sentencia text, mensaje text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE fallo boolean := false;
BEGIN
  BEGIN EXECUTE sentencia; EXCEPTION WHEN OTHERS THEN fallo := true; END;
  IF NOT fallo THEN RAISE EXCEPTION '%', mensaje; END IF;
END $$;
