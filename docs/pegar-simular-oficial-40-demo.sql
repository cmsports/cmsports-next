-- Seed Demostración TDM: campeonato oficial + evento + 40 inscritos.
-- SOLO club 0884dbef-798d-4ce3-9e7a-deace0b4aa95 (Demostración). NUNCA Buin.
--
-- Idempotente: borra el campeonato canónico (cascade) y lo recrea.
-- NO usa _migracion_nueva (seed de datos, no esquema).
--
-- Después del paste:
--   1) Abrir /torneo-oficial en Demostración
--   2) Entrar a "Simulación Manual JG — 40 inscritos"
--   3) Evento → Formar grupos
--      Esperado Manual JG §2.2: 13 grupos (12×3 + 1×4), SIN grupos de 2.
--      O re-correr: node scripts/simular-oficial-40.mjs --limpiar
--                   node scripts/simular-oficial-40.mjs --resultados --probar-marcador
--      (grupos + partidos + programa + muestra de resultados + bridge marcador)
--
-- Requiere tablas oficial_* (156+) y preferible 179/180/181 pegadas.

BEGIN;

DO $$
DECLARE
  v_club uuid := '0884dbef-798d-4ce3-9e7a-deace0b4aa95';
  v_nombre text := 'Simulación Manual JG — 40 inscritos';
  v_camp uuid;
  v_evento uuid;
  v_fecha date := (now() AT TIME ZONE 'America/Santiago')::date;
  i int;
  nombres text[] := ARRAY[
    'Mateo','Sofía','Benjamín','Isidora','Vicente','Emilia','Agustín','Martina',
    'Joaquín','Antonia','Diego','Josefa','Tomás','Florencia','Cristóbal','Valentina',
    'Felipe','Catalina','Ignacio','Amanda','Lucas','Trinidad','Gaspar','Constanza',
    'Bastián','Renata','Maximiliano','Fernanda','Bruno','Javiera','Simón','Rocío',
    'Álvaro','Millaray','Nicolás','Camila','Sebastián','Francisca','Matías','Paula'
  ];
  asocs text[] := ARRAY[
    'Buin','Paine','Demo Norte','Demo Sur','San Bernardo','Maipú','Puente Alto','La Florida'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club) THEN
    RAISE EXCEPTION 'Club Demostración no encontrado';
  END IF;

  -- Cascade borra eventos / inscritos / grupos / partidos de sims previas.
  DELETE FROM oficial_campeonatos
  WHERE club_id = v_club
    AND (
      nombre = v_nombre
      OR nombre ILIKE '[SIM40]%'
    );

  INSERT INTO oficial_campeonatos (
    club_id, nombre, sede, zona, fecha_inicio, estado,
    mesas_count, bloque_minutos, hora_inicio
  ) VALUES (
    v_club, v_nombre, 'Gimnasio Demo', 'Metropolitana Demo', v_fecha, 'inscripcion',
    8, 25, '09:00:00'
  )
  RETURNING id INTO v_camp;

  INSERT INTO oficial_eventos (
    club_id, campeonato_id, nombre, categoria, genero,
    formato_partido, fase, estado, clasifican_por_grupo
  ) VALUES (
    v_club, v_camp, 'Individual Absoluto Varones', 'Absoluto', 'varones',
    'bo5', 'inscripcion', 'en_curso', 2
  )
  RETURNING id INTO v_evento;

  FOR i IN 1..40 LOOP
    INSERT INTO oficial_inscritos (
      club_id, evento_id, nombre, asociacion, genero,
      ranking, orden_inscripcion, cabeza_numero
    ) VALUES (
      v_club,
      v_evento,
      nombres[i] || ' Sim' || i::text,
      asocs[((i - 1) % array_length(asocs, 1)) + 1],
      'V',
      i,
      i,
      CASE WHEN i <= 8 THEN i ELSE NULL END
    );
  END LOOP;

  RAISE NOTICE 'OK campeonato % evento % (40 inscritos). Formar grupos en UI o con el script node.', v_camp, v_evento;
END $$;

COMMIT;

-- Verificación
SELECT c.id, c.nombre, c.estado, count(i.id) AS inscritos
FROM oficial_campeonatos c
JOIN oficial_eventos e ON e.campeonato_id = c.id
LEFT JOIN oficial_inscritos i ON i.evento_id = e.id
WHERE c.club_id = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
  AND c.nombre = 'Simulación Manual JG — 40 inscritos'
GROUP BY c.id, c.nombre, c.estado;
