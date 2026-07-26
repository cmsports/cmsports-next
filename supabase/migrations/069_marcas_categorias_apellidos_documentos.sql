-- Reunión Asociación Buin — cambios 2026-07-26
--   3) Vouchers pasan a colgar de la marca (Aurora / Foxhara / Hidrata) y se
--      muestran desde el dashboard; se elimina el módulo /vouchers.
--   6) Un jugador puede pertenecer a varias categorías (la suya por edad + TC).
--   7) Solicitud de ingreso separa nombres y apellidos.
--   8) Documentos por jugador (derecho de formación y carta de compromiso).
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ============================================================
-- 3. VOUCHERS POR MARCA
-- ============================================================
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS marca text;

-- Los vouchers ya subidos se asocian por nombre cuando se puede deducir.
UPDATE vouchers SET marca = 'aurora'  WHERE marca IS NULL AND nombre ILIKE '%aurora%';
UPDATE vouchers SET marca = 'foxhara' WHERE marca IS NULL AND nombre ILIKE '%foxhara%';
UPDATE vouchers SET marca = 'hidrata' WHERE marca IS NULL AND nombre ILIKE '%hidrata%';

CREATE INDEX IF NOT EXISTS vouchers_club_marca_idx ON vouchers (club_id, marca);


-- ============================================================
-- 6. MULTI-CATEGORÍA POR JUGADOR
-- ============================================================
-- `categoria` (singular) se mantiene como la categoría principal —la de edad—
-- porque ranking, torneos y reportes siguen filtrando por ella. `categorias`
-- guarda la lista completa (principal + TC + las que agregue el admin).
ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS categorias text[];

-- Backfill: todos parten con su categoría actual.
UPDATE jugadores
SET categorias = ARRAY[categoria]
WHERE categorias IS NULL AND categoria IS NOT NULL AND categoria <> '';

UPDATE jugadores
SET categorias = ARRAY[]::text[]
WHERE categorias IS NULL;

-- Solo Asociación Buin usa el esquema de categorías por edad + TC.
UPDATE jugadores
SET categorias = categorias || ARRAY['TC']
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND NOT ('TC' = ANY(categorias));


-- ============================================================
-- 7. NOMBRES Y APELLIDOS SEPARADOS
-- ============================================================
-- `nombre` sigue siendo el nombre completo (lo usa toda la app); estos campos
-- lo desglosan para fichas, informes y la federación.
ALTER TABLE jugadores
  ADD COLUMN IF NOT EXISTS nombres    text,
  ADD COLUMN IF NOT EXISTS apellido1  text,
  ADD COLUMN IF NOT EXISTS apellido2  text,
  ADD COLUMN IF NOT EXISTS apellido3  text;

ALTER TABLE solicitudes_jugador
  ADD COLUMN IF NOT EXISTS nombres    text,
  ADD COLUMN IF NOT EXISTS apellido1  text,
  ADD COLUMN IF NOT EXISTS apellido2  text,
  ADD COLUMN IF NOT EXISTS apellido3  text;

CREATE OR REPLACE FUNCTION public.crear_solicitud_jugador(
  p_codigo                        text,
  p_club_id                       uuid,
  p_nombre                        text,
  p_rut                           text,
  p_email                         text,
  p_telefono                      text DEFAULT NULL,
  p_fecha_nacimiento              text DEFAULT NULL,
  p_direccion                     text DEFAULT NULL,
  p_comuna                        text DEFAULT NULL,
  p_contacto_emergencia_nombre    text DEFAULT NULL,
  p_contacto_emergencia_telefono  text DEFAULT NULL,
  p_indicaciones_medicas          text DEFAULT NULL,
  p_nombres                       text DEFAULT NULL,
  p_apellido1                     text DEFAULT NULL,
  p_apellido2                     text DEFAULT NULL,
  p_apellido3                     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo   text := trim(COALESCE(p_codigo, ''));
  v_nombre   text := trim(COALESCE(p_nombre, ''));
  v_rut      text := trim(COALESCE(p_rut, ''));
  v_email    text := lower(trim(COALESCE(p_email, '')));
  v_telefono text := NULLIF(trim(COALESCE(p_telefono, '')), '');
  v_id uuid;
  v_ok_club      boolean;
  v_ok_codigo    boolean;
  v_ok_identidad boolean;
BEGIN
  IF p_club_id IS NULL OR length(v_codigo) NOT BETWEEN 3 AND 64 THEN RETURN NULL; END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
  IF length(v_rut) NOT BETWEEN 7 AND 20 THEN RAISE EXCEPTION 'RUT inválido'; END IF;
  IF length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF v_telefono IS NOT NULL AND length(v_telefono) > 30 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;

  v_ok_club := public._consumir_limite_publico('solicitud-intento-club', p_club_id::text, 40, 600);
  v_ok_codigo := public._consumir_limite_publico(
    'solicitud-intento-codigo', p_club_id::text || ':' || v_codigo, 8, 600
  );
  IF NOT v_ok_club OR NOT v_ok_codigo THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitaciones i
    WHERE i.codigo::text = v_codigo AND i.club_id = p_club_id AND i.activa = true
  ) THEN
    RETURN NULL;
  END IF;

  v_ok_identidad := public._consumir_limite_publico(
    'solicitud-identidad', p_club_id::text || ':' || v_email || ':' || v_rut, 3, 3600
  );
  IF NOT v_ok_identidad THEN RETURN NULL; END IF;

  SELECT s.id INTO v_id
  FROM public.solicitudes_jugador s
  WHERE s.club_id = p_club_id AND s.estado = 'pendiente'
    AND (lower(COALESCE(s.email, '')) = v_email OR COALESCE(s.rut, '') = v_rut)
  ORDER BY s.creado_en DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.solicitudes_jugador (
    club_id, nombre, rut, email, telefono, estado, password,
    fecha_nacimiento, direccion, comuna,
    contacto_emergencia_nombre, contacto_emergencia_telefono, indicaciones_medicas,
    nombres, apellido1, apellido2, apellido3
  ) VALUES (
    p_club_id, v_nombre, v_rut, v_email, v_telefono, 'pendiente', NULL,
    NULLIF(trim(COALESCE(p_fecha_nacimiento, '')), ''),
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_comuna, '')), ''),
    NULLIF(trim(COALESCE(p_contacto_emergencia_nombre, '')), ''),
    NULLIF(trim(COALESCE(p_contacto_emergencia_telefono, '')), ''),
    NULLIF(trim(COALESCE(p_indicaciones_medicas, '')), ''),
    NULLIF(trim(COALESCE(p_nombres, '')), ''),
    NULLIF(trim(COALESCE(p_apellido1, '')), ''),
    NULLIF(trim(COALESCE(p_apellido2, '')), ''),
    NULLIF(trim(COALESCE(p_apellido3, '')), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- La firma anterior (12 parámetros) queda huérfana: se elimina para que PostgREST
-- no tenga dos candidatas y falle por ambigüedad.
DROP FUNCTION IF EXISTS public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text);


-- ============================================================
-- 8. DOCUMENTOS DEL JUGADOR
-- ============================================================
-- Derecho de formación y carta de compromiso, escaneados (PDF, Word o foto).
CREATE TABLE IF NOT EXISTS jugador_documentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_id     uuid NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('derecho_formacion', 'carta_compromiso')),
  archivo_url    text NOT NULL,
  nombre_archivo text,
  subido_por     text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jugador_id, tipo)
);

CREATE INDEX IF NOT EXISTS jugador_documentos_jugador_idx ON jugador_documentos (jugador_id);

ALTER TABLE jugador_documentos ENABLE ROW LEVEL SECURITY;

-- Visibles para todo el club (el profe pidió que cualquiera pueda verlos).
DROP POLICY IF EXISTS "documentos_select" ON jugador_documentos;
CREATE POLICY "documentos_select" ON jugador_documentos
  FOR SELECT USING (club_id = get_my_club_id());

-- Sube el staff (para cualquier jugador) o el propio jugador (solo el suyo).
DROP POLICY IF EXISTS "documentos_manage" ON jugador_documentos;
CREATE POLICY "documentos_manage" ON jugador_documentos
  FOR ALL USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR jugador_id = get_my_jugador_id()
    )
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'superadmin', 'profesor')
      OR jugador_id = get_my_jugador_id()
    )
  );

COMMIT;
