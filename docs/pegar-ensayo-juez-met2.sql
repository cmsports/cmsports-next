-- Ensayo chico (2 eventos × 12). Para el zonal REAL del Excel Koidan:
--   docs/pegar-zonal-met2-excel.sql  (319 inscritos, ver en /torneo-oficial/vivo/MET2-20)
-- NO toca Buin. Idempotente: borra el campeonato de ensayo y lo recrea.
-- NO usa _migracion_nueva (seed de datos).
--
-- Antes: pegar 179, 180, 181, 194, 195 en SQL Editor.
-- Después: entrar al club Juez MET2 Costa → /torneo-oficial → "Ensayo zonal MET2".
--   1) Evento → Inscripción → (ya hay 12) Formar grupos
--   2) Campeonato → Auto-programar → PDF mural
--   3) Cargar 2 resultados + un W.O. → ver llaves

BEGIN;

DO $$
DECLARE
  v_club uuid := '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430';
  v_nombre text := 'Ensayo zonal MET2';
  v_camp uuid;
  v_juv uuid;
  v_pen uuid;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  i int;
  nombres_juv text[] := ARRAY[
    'Campos Julian','Gonzalez Agustin','Perea Mariano','Soto Luis',
    'Rojas Diego','Muñoz Ana','Vega Tomas','Silva Catalina',
    'Reyes Bruno','Navarro Isidora','Fuentes Mateo','Castro Emilia'
  ];
  asocs_juv text[] := ARRAY['SMG','CRD','MAC','BUI','PAI','SMB','SMG','CRD','MAC','BUI','PAI','SMB'];
  nombres_pen text[] := ARRAY[
    'Araya Nico','Bravo Javiera','Cortes Benja','Diaz Martina',
    'Espinoza Gaspar','Flores Antonia','Guzman Ignacio','Herrera Florencia',
    'Ibarra Felipe','Jimenez Valentina','Lagos Cristobal','Mora Constanza'
  ];
  asocs_pen text[] := ARRAY['SMG','PAI','BUI','CRD','MAC','SMB','SMG','PAI','BUI','CRD','MAC','SMB'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club) THEN
    RAISE EXCEPTION 'Club juez MET2 Costa no encontrado. Pegá 194_club_juez_met2.sql primero.';
  END IF;

  DELETE FROM oficial_campeonatos
  WHERE club_id = v_club AND nombre = v_nombre;

  INSERT INTO oficial_campeonatos (
    club_id, nombre, sede, zona, fecha_inicio, fecha_fin, estado,
    mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio
  ) VALUES (
    v_club, v_nombre, 'Gimnasio ensayo', 'MET2 Costa', v_fecha, v_fecha, 'inscripcion',
    8, 25, 70, '08:30:00'
  )
  RETURNING id INTO v_camp;

  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Juv V', 'Juvenil', 'varones',
    'bo5', 'inscripcion', 'en_curso', 2, v_fecha, 8
  )
  RETURNING id INTO v_juv;

  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
  ) VALUES (
    v_club, v_camp, 'Pen V', 'Peneca', 'varones',
    'bo5', 'inscripcion', 'en_curso', 2, v_fecha, 8
  )
  RETURNING id INTO v_pen;

  FOR i IN 1..12 LOOP
    INSERT INTO oficial_inscritos (
      club_id, evento_id, nombre, asociacion, genero, ranking, orden_inscripcion
    ) VALUES (
      v_club, v_juv, nombres_juv[i], asocs_juv[i], 'V', i, i
    );
    INSERT INTO oficial_inscritos (
      club_id, evento_id, nombre, asociacion, genero, ranking, orden_inscripcion
    ) VALUES (
      v_club, v_pen, nombres_pen[i], asocs_pen[i], 'V', i, i
    );
  END LOOP;

  INSERT INTO oficial_bloques_especiales (
    club_id, campeonato_id, fecha, hora, duracion_min, tipo, etiqueta
  ) VALUES (
    v_club, v_camp, v_fecha, '13:00:00', 40, 'receso', 'Receso almuerzo'
  );
END $$;

COMMIT;
