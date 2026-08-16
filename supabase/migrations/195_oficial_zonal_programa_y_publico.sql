-- Zonal juez: día por evento, bloque de grupo, bloques especiales (receso),
-- tamaño de cuadro / pre-llave, código público y RPC de mural.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Requiere: 156, 158. 180/181 recomendadas.

BEGIN;
SELECT _migracion_nueva('195_oficial_zonal_programa_y_publico');

ALTER TABLE oficial_campeonatos
  ADD COLUMN IF NOT EXISTS bloque_grupo_minutos integer NOT NULL DEFAULT 70
    CHECK (bloque_grupo_minutos BETWEEN 20 AND 180),
  ADD COLUMN IF NOT EXISTS codigo_publico text;

CREATE UNIQUE INDEX IF NOT EXISTS oficial_campeonatos_codigo_publico_key
  ON oficial_campeonatos (codigo_publico)
  WHERE codigo_publico IS NOT NULL;

ALTER TABLE oficial_eventos
  ADD COLUMN IF NOT EXISTS fecha_juego date,
  ADD COLUMN IF NOT EXISTS tamano_cuadro integer
    CHECK (tamano_cuadro IS NULL OR tamano_cuadro IN (8, 16, 32, 64));

ALTER TABLE oficial_partidos
  ADD COLUMN IF NOT EXISTS avance_origen_orden integer
    CHECK (avance_origen_orden IS NULL OR avance_origen_orden >= 0);

CREATE TABLE IF NOT EXISTS oficial_bloques_especiales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  campeonato_id  uuid NOT NULL REFERENCES oficial_campeonatos(id) ON DELETE CASCADE,
  fecha          date NOT NULL,
  hora           time NOT NULL,
  duracion_min   integer NOT NULL DEFAULT 40
    CHECK (duracion_min BETWEEN 5 AND 180),
  tipo           text NOT NULL DEFAULT 'receso'
    CHECK (tipo IN ('apertura', 'receso', 'premiacion', 'otro')),
  etiqueta       text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oficial_bloques_especiales_camp_idx
  ON oficial_bloques_especiales (campeonato_id, fecha, hora);

ALTER TABLE oficial_bloques_especiales ENABLE ROW LEVEL SECURITY;

UPDATE oficial_eventos e
SET fecha_juego = c.fecha_inicio
FROM oficial_campeonatos c
WHERE e.campeonato_id = c.id
  AND e.fecha_juego IS NULL;

COMMIT;

-- Políticas + realtime (transacción corta)
BEGIN;

DROP POLICY IF EXISTS oficial_bloques_especiales_staff ON oficial_bloques_especiales;
CREATE POLICY oficial_bloques_especiales_staff ON oficial_bloques_especiales
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.oficial_bloques_especiales;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Código público al crear campeonato (mismo criterio que torneos club).
CREATE OR REPLACE FUNCTION public.gen_codigo_oficial(p_club_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefijo text;
  v_num int;
  v_codigo text;
BEGIN
  SELECT nombre INTO v_prefijo FROM clubes WHERE id = p_club_id;
  v_prefijo := upper(coalesce(v_prefijo, 'OFIC'));
  v_prefijo := translate(v_prefijo, 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
  v_prefijo := regexp_replace(v_prefijo, '^CLUB\s*', '');
  v_prefijo := regexp_replace(v_prefijo, '[^A-Z0-9]', '', 'g');
  IF v_prefijo = '' THEN v_prefijo := 'OFIC'; END IF;
  v_prefijo := substr(v_prefijo, 1, 6);

  SELECT coalesce(max(split_part(codigo_publico, '-', 2)::int), 0) + 1
    INTO v_num
    FROM oficial_campeonatos
    WHERE codigo_publico ~ ('^' || v_prefijo || '-[0-9]+$');

  LOOP
    v_codigo := v_prefijo || '-' || lpad(v_num::text, 2, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM oficial_campeonatos WHERE codigo_publico = v_codigo);
    v_num := v_num + 1;
  END LOOP;

  RETURN v_codigo;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_codigo_oficial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo_publico IS NULL THEN
    NEW.codigo_publico := gen_codigo_oficial(NEW.club_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oficial_campeonatos_set_codigo ON oficial_campeonatos;
CREATE TRIGGER oficial_campeonatos_set_codigo
  BEFORE INSERT ON oficial_campeonatos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_codigo_oficial();

UPDATE oficial_campeonatos
SET codigo_publico = gen_codigo_oficial(club_id)
WHERE codigo_publico IS NULL;

ALTER FUNCTION public.gen_codigo_oficial(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_codigo_oficial() SET search_path = public, pg_temp;

-- Snapshot mural para jugadores (anon). Exige el código; no enumera campeonatos.
CREATE OR REPLACE FUNCTION public.oficial_campeonato_publico(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_camp oficial_campeonatos%ROWTYPE;
  v_codigo text := upper(trim(p_codigo));
BEGIN
  IF v_codigo IS NULL OR v_codigo = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_camp
  FROM oficial_campeonatos
  WHERE codigo_publico = v_codigo
    AND estado <> 'archivado';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'campeonato', jsonb_build_object(
      'id', v_camp.id,
      'nombre', v_camp.nombre,
      'sede', v_camp.sede,
      'zona', v_camp.zona,
      'fecha_inicio', v_camp.fecha_inicio,
      'fecha_fin', v_camp.fecha_fin,
      'mesas_count', v_camp.mesas_count,
      'codigo', v_camp.codigo_publico
    ),
    'eventos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'categoria', e.categoria,
        'genero', e.genero,
        'fase', e.fase,
        'fecha_juego', e.fecha_juego
      ) ORDER BY e.nombre), '[]'::jsonb)
      FROM oficial_eventos e
      WHERE e.campeonato_id = v_camp.id
        AND e.estado <> 'archivado'
    ),
    'grupos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'evento_id', g.evento_id,
        'nombre', g.nombre,
        'orden', g.orden
      ) ORDER BY g.orden), '[]'::jsonb)
      FROM oficial_grupos g
      JOIN oficial_eventos e ON e.id = g.evento_id
      WHERE e.campeonato_id = v_camp.id
    ),
    'inscritos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'evento_id', i.evento_id,
        'nombre', i.nombre,
        'asociacion', i.asociacion
      )), '[]'::jsonb)
      FROM oficial_inscritos i
      JOIN oficial_eventos e ON e.id = i.evento_id
      WHERE e.campeonato_id = v_camp.id
    ),
    'partidos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'evento_id', p.evento_id,
        'grupo_id', p.grupo_id,
        'fase', p.fase,
        'orden', p.orden,
        'inscrito_a_id', p.inscrito_a_id,
        'inscrito_b_id', p.inscrito_b_id,
        'ganador_id', p.ganador_id,
        'mesa', p.mesa,
        'programado_en', p.programado_en,
        'numero_ittf', p.numero_ittf,
        'es_walkover', p.es_walkover,
        'tipo_cierre', p.tipo_cierre
      ) ORDER BY p.programado_en NULLS LAST, p.mesa, p.orden), '[]'::jsonb)
      FROM oficial_partidos p
      JOIN oficial_eventos e ON e.id = p.evento_id
      WHERE e.campeonato_id = v_camp.id
        AND p.programado_en IS NOT NULL
    ),
    'especiales', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'fecha', b.fecha,
        'hora', b.hora,
        'duracion_min', b.duracion_min,
        'tipo', b.tipo,
        'etiqueta', b.etiqueta
      ) ORDER BY b.fecha, b.hora), '[]'::jsonb)
      FROM oficial_bloques_especiales b
      WHERE b.campeonato_id = v_camp.id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oficial_campeonato_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oficial_campeonato_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_codigo_oficial(uuid) TO authenticated;
