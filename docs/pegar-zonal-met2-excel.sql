-- Réplica operativa de la 2da Fecha Individual MET2 (estilo Excel Koidan)
-- en el club Juez MET2 Costa. NO toca Buin.
--
-- No es migración (no usa _migracion_nueva). Idempotente: borra SOLO el
-- campeonato con este nombre en el club juez y lo vuelve a crear.
--
-- El xlsx original no vive en el repo: nombres y asociaciones son de ensayo
-- (formato NAME/COD). La estructura sí es la del zonal: 8 eventos, sáb+dom,
-- 12 mesas, 70 min/grupo, receso, mural, un cuadro con pre-llave.
--
-- Pegar entero en SQL Editor de Supabase.
-- Después: club Juez MET2 Costa → Torneo oficial →
--   "2da Fecha Individual Sub19 MET2 2026"
-- Link vivo: /torneo-oficial/vivo/MET2-01

BEGIN;

DO $$
DECLARE
  v_club uuid := '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430';
  v_nombre text := '2da Fecha Individual Sub19 MET2 2026';
  v_camp uuid;
  v_sab date := date '2026-08-22';
  v_dom date := date '2026-08-23';
  v_ev uuid;
  v_n int;
  v_g int;
  v_i int;
  v_j int;
  v_base int;
  v_rem int;
  v_gi int;
  v_best int;
  v_best_size int;
  v_best_ok int;
  v_asoc text;
  v_hora time;
  v_ola int;
  v_mesa int;
  v_num int;
  v_a uuid;
  v_b uuid;
  v_ga uuid;
  v_ins record;
  apellidos text[] := ARRAY[
    'Campos','Gonzalez','Perea','Soto','Rojas','Munoz','Vega','Silva',
    'Reyes','Navarro','Fuentes','Castro','Araya','Bravo','Cortes','Diaz',
    'Espinoza','Flores','Guzman','Herrera'
  ];
  pilas text[] := ARRAY[
    'Julian','Agustin','Mariano','Luis','Diego','Ana','Tomas','Catalina',
    'Bruno','Isidora','Mateo','Emilia','Nico','Javiera','Benja','Martina'
  ];
  asocs text[] := ARRAY['SMG','CRD','MAC','BUI','PAI','SMB','MEL','TAL'];
  r record;
  g record;
  p record;
  ids uuid[];
  sizes int[];
  clubes text[];
  maxs int[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club) THEN
    RAISE EXCEPTION 'Club juez MET2 Costa no encontrado. Pegá 194_club_juez_met2.sql primero.';
  END IF;

  DELETE FROM oficial_campeonatos
  WHERE club_id = v_club AND nombre = v_nombre;

  INSERT INTO oficial_campeonatos (
    club_id, nombre, sede, zona, fecha_inicio, fecha_fin, estado,
    mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio, codigo_publico, notas
  ) VALUES (
    v_club, v_nombre,
    'Gimnasio Municipal de Buin',
    'Metropolitana 2 - Costa',
    v_sab, v_dom, 'en_curso',
    12, 25, 70, '08:30:00', 'MET2-01',
    'Réplica de prueba del zonal (Excel Koidan). Sub11 Damas tiene grupos cerrados para sincronizar llaves. Sub19 V tiene pre-llave (cuadro 16).'
  )
  RETURNING id INTO v_camp;

  INSERT INTO oficial_bloques_especiales (club_id, campeonato_id, fecha, hora, duracion_min, tipo, etiqueta) VALUES
    (v_club, v_camp, v_sab, '08:00:00', 25, 'apertura', 'Apertura / confirmación'),
    (v_club, v_camp, v_sab, '13:00:00', 40, 'receso', 'Receso almuerzo'),
    (v_club, v_camp, v_dom, '13:00:00', 40, 'receso', 'Receso almuerzo');

  DROP TABLE IF EXISTS tmp_ev;
  CREATE TEMP TABLE tmp_ev (
    id uuid PRIMARY KEY,
    clave text,
    n int,
    fecha date,
    completar boolean
  ) ON COMMIT DROP;

  -- 8 eventos: sábado menores, domingo mayores. Sub19 V = 30 → 10 grupos → cuadro 16 (pre-llave).
  FOR r IN
    SELECT * FROM (VALUES
      ('Sub11 V', 'Sub11', 'varones', 16, v_sab, 8,  false),
      ('Sub11 D', 'Sub11', 'damas',   12, v_sab, 8,  true),
      ('Sub13 V', 'Sub13', 'varones', 24, v_sab, 16, false),
      ('Sub13 D', 'Sub13', 'damas',   16, v_sab, 8,  false),
      ('Sub15 V', 'Sub15', 'varones', 28, v_dom, 16, false),
      ('Sub15 D', 'Sub15', 'damas',   16, v_dom, 8,  false),
      ('Sub19 V', 'Sub19', 'varones', 30, v_dom, 16, false),
      ('Sub19 D', 'Sub19', 'damas',   18, v_dom, 16, false)
    ) AS t(nombre, categoria, genero, n, fecha, tamano, completar)
  LOOP
    INSERT INTO oficial_eventos (
      club_id, campeonato_id, nombre, categoria, genero,
      formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro
    ) VALUES (
      v_club, v_camp, r.nombre, r.categoria, r.genero,
      'bo5', 'grupos', 'en_curso', 2, r.fecha, r.tamano
    )
    RETURNING id INTO v_ev;

    INSERT INTO tmp_ev(id, clave, n, fecha, completar)
    VALUES (v_ev, r.nombre, r.n, r.fecha, r.completar);

    v_g := r.n / 3;
    FOR v_i IN 1..r.n LOOP
      INSERT INTO oficial_inscritos (
        club_id, evento_id, nombre, asociacion, codigo_federativo,
        genero, ranking, cabeza_numero, orden_inscripcion
      ) VALUES (
        v_club, v_ev,
        apellidos[1 + ((v_i - 1) % 20)] || ' ' || pilas[1 + (((v_i - 1) / 20) % 16)] || ' ' || r.nombre || '-' || v_i,
        asocs[1 + ((v_i - 1) % 8)],
        (6000 + (ascii(substr(r.nombre, 6, 1)) % 9) * 100 + v_i)::text,
        CASE WHEN r.genero = 'damas' THEN 'D' ELSE 'V' END,
        v_i,
        CASE WHEN v_i <= v_g THEN v_i ELSE NULL END,
        v_i
      );
    END LOOP;
  END LOOP;

  -- Grupos + partidos ITTF (3: 1-3, 1-2, 2-3 / 4: secuencia Excel)
  FOR r IN SELECT * FROM tmp_ev LOOP
    SELECT count(*)::int INTO v_n FROM oficial_inscritos WHERE evento_id = r.id;
    v_g := v_n / 3;
    v_base := v_n / v_g;
    v_rem := v_n % v_g;
    maxs := ARRAY[]::int[];
    sizes := ARRAY[]::int[];
    clubes := ARRAY[]::text[];
    FOR v_i IN 1..v_g LOOP
      maxs := maxs || (v_base + CASE WHEN v_i <= v_rem THEN 1 ELSE 0 END);
      sizes := sizes || 0;
      clubes := clubes || '';
      INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)
      VALUES (v_club, r.id, chr(64 + v_i), v_i - 1);
    END LOOP;

    FOR v_ins IN
      SELECT i.id, i.asociacion, i.ranking
      FROM oficial_inscritos i
      WHERE i.evento_id = r.id
      ORDER BY i.ranking NULLS LAST, i.orden_inscripcion
    LOOP
      IF v_ins.ranking <= v_g THEN
        v_gi := v_ins.ranking; -- 1..g
      ELSE
        v_best := 1;
        v_best_size := 999;
        v_best_ok := 0;
        FOR v_i IN 1..v_g LOOP
          IF sizes[v_i] >= maxs[v_i] THEN CONTINUE; END IF;
          v_j := CASE WHEN clubes[v_i] NOT LIKE '%' || coalesce(v_ins.asociacion, '') || '%' THEN 1 ELSE 0 END;
          IF sizes[v_i] < v_best_size OR (sizes[v_i] = v_best_size AND v_j > v_best_ok) THEN
            v_best := v_i;
            v_best_size := sizes[v_i];
            v_best_ok := v_j;
          END IF;
        END LOOP;
        v_gi := v_best;
      END IF;

      SELECT id INTO v_ga FROM oficial_grupos WHERE evento_id = r.id AND orden = v_gi - 1;
      INSERT INTO oficial_grupo_inscritos (club_id, grupo_id, inscrito_id, orden)
      VALUES (v_club, v_ga, v_ins.id, sizes[v_gi]);
      sizes[v_gi] := sizes[v_gi] + 1;
      IF v_ins.asociacion IS NOT NULL THEN
        clubes[v_gi] := clubes[v_gi] || v_ins.asociacion || ',';
      END IF;
    END LOOP;

    FOR g IN SELECT * FROM oficial_grupos WHERE evento_id = r.id ORDER BY orden LOOP
      SELECT array_agg(gi.inscrito_id ORDER BY gi.orden) INTO ids
      FROM oficial_grupo_inscritos gi WHERE gi.grupo_id = g.id;
      IF ids IS NULL THEN CONTINUE; END IF;
      IF array_length(ids, 1) = 3 THEN
        INSERT INTO oficial_partidos (club_id, evento_id, grupo_id, fase, orden, inscrito_a_id, inscrito_b_id)
        VALUES
          (v_club, r.id, g.id, 'grupos', 0, ids[1], ids[3]),
          (v_club, r.id, g.id, 'grupos', 1, ids[1], ids[2]),
          (v_club, r.id, g.id, 'grupos', 2, ids[2], ids[3]);
      ELSIF array_length(ids, 1) = 4 THEN
        INSERT INTO oficial_partidos (club_id, evento_id, grupo_id, fase, orden, inscrito_a_id, inscrito_b_id)
        VALUES
          (v_club, r.id, g.id, 'grupos', 0, ids[1], ids[3]),
          (v_club, r.id, g.id, 'grupos', 1, ids[2], ids[4]),
          (v_club, r.id, g.id, 'grupos', 2, ids[1], ids[2]),
          (v_club, r.id, g.id, 'grupos', 3, ids[3], ids[4]),
          (v_club, r.id, g.id, 'grupos', 4, ids[1], ids[4]),
          (v_club, r.id, g.id, 'grupos', 5, ids[2], ids[3]);
      END IF;
    END LOOP;
  END LOOP;

  -- Programa: cada grupo = una mesa × 70 min. Olas 08:30, 09:40, 10:50, luego 13:40…
  FOR r IN SELECT DISTINCT fecha FROM tmp_ev ORDER BY 1 LOOP
    v_ola := 0;
    FOR g IN
      SELECT gr.id, e.id AS evento_id, e.fecha_juego
      FROM oficial_grupos gr
      JOIN oficial_eventos e ON e.id = gr.evento_id
      WHERE e.campeonato_id = v_camp AND e.fecha_juego = r.fecha
      ORDER BY e.nombre, gr.orden
    LOOP
      v_mesa := (v_ola % 12) + 1;
      v_j := v_ola / 12; -- n° de ola
      IF v_j <= 2 THEN
        v_hora := time '08:30' + (v_j * interval '70 minutes');
      ELSE
        v_hora := time '13:40' + ((v_j - 3) * interval '70 minutes');
      END IF;
      UPDATE oficial_partidos p
      SET
        mesa = v_mesa,
        programado_en = ((g.fecha_juego::text || ' ' || v_hora::text)::timestamp AT TIME ZONE 'America/Santiago')
      WHERE p.grupo_id = g.id AND p.fase = 'grupos';
      v_ola := v_ola + 1;
    END LOOP;
  END LOOP;

  -- Numeración ITTF del programa
  v_num := 1;
  FOR p IN
    SELECT id FROM oficial_partidos
    WHERE evento_id IN (SELECT id FROM tmp_ev)
      AND programado_en IS NOT NULL
    ORDER BY programado_en, mesa, orden
  LOOP
    UPDATE oficial_partidos SET numero_ittf = v_num WHERE id = p.id;
    v_num := v_num + 1;
  END LOOP;

  -- Sub11 Damas: todos los grupos cerrados (1° gana los dos, 2° gana al 3°)
  FOR p IN
    SELECT pa.id, pa.inscrito_a_id, pa.inscrito_b_id, pa.orden, pa.grupo_id
    FROM oficial_partidos pa
    JOIN tmp_ev e ON e.id = pa.evento_id
    WHERE e.clave = 'Sub11 D' AND pa.fase = 'grupos'
  LOOP
    SELECT array_agg(gi.inscrito_id ORDER BY gi.orden) INTO ids
    FROM oficial_grupo_inscritos gi WHERE gi.grupo_id = p.grupo_id;
    v_ga := CASE
      WHEN p.orden = 0 THEN ids[1]
      WHEN p.orden = 1 THEN ids[1]
      ELSE ids[2]
    END;
    UPDATE oficial_partidos SET
      ganador_id = v_ga,
      tipo_cierre = 'jugado',
      es_walkover = false,
      sets = '[[11,7],[11,8],[11,6]]'::jsonb
    WHERE id = p.id;
  END LOOP;

  -- Sub19 V grupo A completo + un W.O. en grupo B (partido 1-3)
  FOR p IN
    SELECT pa.id, pa.orden, pa.grupo_id, gr.nombre AS gnom
    FROM oficial_partidos pa
    JOIN oficial_grupos gr ON gr.id = pa.grupo_id
    JOIN tmp_ev e ON e.id = pa.evento_id
    WHERE e.clave = 'Sub19 V' AND pa.fase = 'grupos' AND gr.nombre IN ('A', 'B')
  LOOP
    SELECT array_agg(gi.inscrito_id ORDER BY gi.orden) INTO ids
    FROM oficial_grupo_inscritos gi WHERE gi.grupo_id = p.grupo_id;
    IF p.gnom = 'B' AND p.orden = 0 THEN
      UPDATE oficial_partidos SET
        ganador_id = ids[1],
        tipo_cierre = 'walkover',
        es_walkover = true,
        motivo_cierre = 'No se presentó',
        alcance_sancion = 'partido',
        sets = '[]'::jsonb
      WHERE id = p.id;
    ELSIF p.gnom = 'A' THEN
      v_ga := CASE WHEN p.orden = 2 THEN ids[2] ELSE ids[1] END;
      UPDATE oficial_partidos SET
        ganador_id = v_ga,
        tipo_cierre = 'jugado',
        es_walkover = false,
        sets = '[[11,9],[9,11],[11,7],[11,5]]'::jsonb
      WHERE id = p.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Campeonato % listo. Vivo: /torneo-oficial/vivo/MET2-01', v_camp;
END $$;

COMMIT;

-- Resumen
SELECT c.nombre, c.codigo_publico, c.fecha_inicio, c.fecha_fin, c.mesas_count,
       (SELECT count(*) FROM oficial_eventos e WHERE e.campeonato_id = c.id) AS eventos,
       (SELECT count(*) FROM oficial_inscritos i
          JOIN oficial_eventos e ON e.id = i.evento_id WHERE e.campeonato_id = c.id) AS inscritos,
       (SELECT count(*) FROM oficial_grupos g
          JOIN oficial_eventos e ON e.id = g.evento_id WHERE e.campeonato_id = c.id) AS grupos,
       (SELECT count(*) FROM oficial_partidos p
          JOIN oficial_eventos e ON e.id = p.evento_id WHERE e.campeonato_id = c.id) AS partidos
FROM oficial_campeonatos c
WHERE c.club_id = '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430'
  AND c.nombre = '2da Fecha Individual Sub19 MET2 2026';
