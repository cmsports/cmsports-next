-- ============================================================
-- CmSports — Código público por torneo + vista en vivo (Kahoot-style)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
--   3. Se puede correr de nuevo sin riesgo (idempotente)
--
-- Qué agrega:
--   1. Columna torneos.codigo (6 caracteres, único) — la "clave" que
--      se comparte para ver el torneo en vivo sin cuenta.
--   2. Trigger que la genera sola al crear un torneo + backfill.
--   3. torneo_publico(codigo) — snapshot de solo lectura (torneo,
--      grupos, jugadores, partidos). SECURITY DEFINER: no expone las
--      tablas al rol anon, exige el código exacto (no se puede enumerar).
--   4. solicitar_acceso_torneo(codigo, nombre, email) — un jugador del
--      club sin cuenta deja su correo; crea una solicitud_jugador.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Columna código
-- ────────────────────────────────────────────────────────────
ALTER TABLE torneos ADD COLUMN IF NOT EXISTS codigo text;
CREATE UNIQUE INDEX IF NOT EXISTS torneos_codigo_key ON torneos (codigo);


-- ────────────────────────────────────────────────────────────
-- 2. Generador de código legible + trigger + backfill
--    Formato: PREFIJO-NN  (ej. PAINE-01, UNIONS-03)
--    · PREFIJO = nombre del club sin acentos, sin "CLUB", máx 6 letras.
--    · NN = correlativo por prefijo (2 dígitos, crece si hace falta).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gen_codigo_torneo(p_club_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefijo text;
  v_num int;
  v_codigo text;
BEGIN
  SELECT nombre INTO v_prefijo FROM clubes WHERE id = p_club_id;
  v_prefijo := upper(coalesce(v_prefijo, 'TORNEO'));
  v_prefijo := translate(v_prefijo, 'ÁÉÍÓÚÜÑ', 'AEIOUUN');   -- quita acentos
  v_prefijo := regexp_replace(v_prefijo, '^CLUB\s*', '');    -- quita "CLUB " al inicio
  v_prefijo := regexp_replace(v_prefijo, '[^A-Z0-9]', '', 'g');
  IF v_prefijo = '' THEN v_prefijo := 'TORNEO'; END IF;
  v_prefijo := substr(v_prefijo, 1, 6);

  -- Siguiente correlativo para ese prefijo
  SELECT coalesce(max(split_part(codigo, '-', 2)::int), 0) + 1
    INTO v_num
    FROM torneos
    WHERE codigo ~ ('^' || v_prefijo || '-[0-9]+$');

  LOOP
    v_codigo := v_prefijo || '-' || lpad(v_num::text, 2, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM torneos WHERE codigo = v_codigo);
    v_num := v_num + 1;
  END LOOP;

  RETURN v_codigo;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_codigo_torneo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := gen_codigo_torneo(NEW.club_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS torneos_set_codigo ON torneos;
CREATE TRIGGER torneos_set_codigo
  BEFORE INSERT ON torneos
  FOR EACH ROW EXECUTE FUNCTION set_codigo_torneo();

-- Backfill de torneos existentes (uno a uno para respetar el correlativo)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, club_id FROM torneos WHERE codigo IS NULL LOOP
    UPDATE torneos SET codigo = gen_codigo_torneo(r.club_id) WHERE id = r.id;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────
-- 3. torneo_publico(codigo) — snapshot de solo lectura
--    Devuelve NULL si el código no existe. Excluye el grupo MESA
--    (bolsa de inscripción) de los grupos, pero incluye a todos
--    los inscritos en 'jugadores' para poder "marcar quién eres".
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.torneo_publico(p_codigo text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'torneo', json_build_object(
      'id', t.id, 'nombre', t.nombre, 'fase', t.fase, 'estado', t.estado
    ),
    'grupos', COALESCE((
      SELECT json_agg(json_build_object('id', g.id, 'nombre', g.nombre) ORDER BY g.nombre)
      FROM torneo_grupos g
      WHERE g.torneo_id = t.id AND g.nombre <> 'MESA'
    ), '[]'::json),
    'jugadores', COALESCE((
      SELECT json_agg(json_build_object('id', j.id, 'nombre', j.nombre, 'grupo_id', gj.grupo_id))
      FROM grupo_jugadores gj
      JOIN torneo_grupos g ON g.id = gj.grupo_id
      JOIN jugadores j ON j.id = gj.jugador_id
      WHERE g.torneo_id = t.id
    ), '[]'::json),
    'partidos', COALESCE((
      SELECT json_agg(json_build_object(
        'id', p.id, 'fase', p.fase, 'grupo_id', p.grupo_id, 'orden', p.orden,
        'jugador_a', p.jugador_a, 'jugador_b', p.jugador_b, 'ganador', p.ganador,
        'nombre_a', ja.nombre, 'nombre_b', jb.nombre
      ) ORDER BY p.fase, p.orden)
      FROM torneo_partidos p
      LEFT JOIN jugadores ja ON ja.id = p.jugador_a
      LEFT JOIN jugadores jb ON jb.id = p.jugador_b
      WHERE p.torneo_id = t.id
    ), '[]'::json)
  )
  FROM torneos t
  WHERE t.codigo = upper(p_codigo)
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.torneo_publico(text) FROM public;
GRANT EXECUTE ON FUNCTION public.torneo_publico(text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. solicitar_acceso_torneo — jugador del club sin cuenta deja
--    su correo → crea una solicitud_jugador para que el profe/admin
--    la apruebe y le genere la cuenta.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solicitar_acceso_torneo(
  p_codigo text, p_nombre text, p_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_id uuid;
BEGIN
  SELECT club_id INTO v_club FROM torneos WHERE codigo = upper(p_codigo) LIMIT 1;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;
  IF p_email IS NULL OR position('@' IN p_email) = 0 THEN
    RAISE EXCEPTION 'Correo inválido';
  END IF;

  INSERT INTO solicitudes_jugador (club_id, nombre, email, estado)
  VALUES (v_club, COALESCE(NULLIF(trim(p_nombre), ''), 'Sin nombre'), lower(trim(p_email)), 'pendiente')
  RETURNING id INTO v_id;

  -- TODO(conectar-luego): avisar al profe/admin del club (email + campanita),
  -- reutilizando el mismo canal que dispara el registro de jugadores.

  RETURN json_build_object('ok', true, 'solicitud_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitar_acceso_torneo(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.solicitar_acceso_torneo(text, text, text) TO anon, authenticated;

-- ============================================================
-- DONE 🎾  El código aparece en torneos.codigo. Compártelo como
--          /vivo/CODIGO para ver el torneo en vivo sin cuenta.
-- ============================================================
