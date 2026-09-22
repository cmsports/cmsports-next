-- ────────────────────────────────────────────────────────────
-- Dos cosas que viajan juntas porque tocan las mismas dos funciones:
--
--   1. Que un link de invitación aguante una inscripción masiva.
--   2. Que la solicitud pida el perfil deportivo cuando el club lo usa.
--
-- Este cambio afecta a: **el esquema, para todos**. Las columnas nuevas nacen
-- NULL y el formulario solo las muestra si el club tiene el módulo
-- 'perfil_deportivo' —que hoy es Spinhouse y solo Spinhouse (migración 254)—.
-- Para Buin la pantalla de registro queda exactamente igual. No se toca
-- ninguna fila de ningún club.
--
-- ══ 1. Los topes: por qué el de 8 sobraba ═════════════════════════════════
--
-- `_consumir_limite_publico('invitacion-codigo', <codigo>, 8, 600)` cuenta
-- intentos POR CÓDIGO. Quien adivina códigos prueba uno distinto cada vez, así
-- que cada intento suyo cae en un balde propio y muere en 1: ese tope no se le
-- activa NUNCA. El único caso en que se activa es mucha gente usando el mismo
-- código VÁLIDO — o sea, exactamente la inscripción masiva que el link existe
-- para permitir. Era costo puro.
--
-- El que sí frena adivinanzas es el de club, porque el club_id va en la URL y
-- es el mismo para todos los intentos de un atacante. Se sube de 40 a 300 cada
-- 10 minutos: 43.200 al día contra un espacio de 10^8 códigos son ~6 años para
-- barrerlo entero, y lo que se gana al acertar es poder mandar UNA solicitud
-- que un humano tiene que aprobar. El global de 300/minuto no se toca: ese
-- protege la base, no el secreto.
--
-- El tope por identidad (3 por email+rut cada hora) TAMPOCO se toca: ese sí
-- hace su trabajo, evita que una misma persona inunde la bandeja del club.
--
-- ⚠ El tope estaba en DOS funciones, no en una. `validar_invitacion` deja
-- entrar al formulario y `crear_solicitud_jugador` acepta el envío. Subir solo
-- la primera dejaba el arreglo a medias: los jugadores llenaban la ficha y se
-- la rebotaban al apretar Enviar.
--
-- ══ 2. Por qué el gate es el módulo y no una clave de club_config ═════════
--
-- Porque el módulo YA existe y ya significa esto: 'perfil_deportivo' es "los
-- campos deportivos de la ficha" (254, y `modulos.ts:72`). Una clave nueva
-- sería un segundo interruptor para lo mismo, que tarde o temprano queda
-- medio encendido.
--
-- Como /registro es público y no tiene sesión, el dato viaja en la respuesta
-- de `validar_invitacion`: la página no puede consultar `clubes`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('280_solicitud_perfil_deportivo_y_cuotas');
SELECT _migracion_para_todos_los_clubes(
  'sube dos cuotas de endpoints públicos y agrega columnas nullable; no toca filas'
);


-- ══ 1. Las cinco columnas en la solicitud ═════════════════════════════════
--
-- Las mismas cinco que la 254 le puso a `jugadores`, con los mismos dos CHECK.
-- El CHECK acá no es decorativo: `crear_solicitud_jugador` es una función
-- pública que ejecuta `anon`, así que este es el borde de confianza y el valor
-- llega de un navegador. Acepta NULL, que es lo que manda todo club sin el
-- módulo.
ALTER TABLE public.solicitudes_jugador
  ADD COLUMN IF NOT EXISTS nivel              text,
  ADD COLUMN IF NOT EXISTS licencia_fechiteme text,
  ADD COLUMN IF NOT EXISTS mano_habil         text,
  ADD COLUMN IF NOT EXISTS estilo_juego       text,
  ADD COLUMN IF NOT EXISTS material           text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitudes_nivel_valido') THEN
    ALTER TABLE public.solicitudes_jugador ADD CONSTRAINT solicitudes_nivel_valido
      CHECK (nivel IS NULL OR nivel IN ('iniciacion', 'intermedio', 'competitivo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitudes_mano_habil_valida') THEN
    ALTER TABLE public.solicitudes_jugador ADD CONSTRAINT solicitudes_mano_habil_valida
      CHECK (mano_habil IS NULL OR mano_habil IN ('diestro', 'zurdo'));
  END IF;
END;
$$;


-- ══ 2. validar_invitacion: cuotas nuevas y el módulo en la respuesta ══════
--
-- Cambia el tipo de retorno (suma una columna), así que no basta un CREATE OR
-- REPLACE: hay que soltarla y rehacerla. Va dentro de la transacción, así que
-- no existe un instante en que la función falte para quien esté registrándose.
DROP FUNCTION IF EXISTS public.validar_invitacion(text, uuid);

CREATE FUNCTION public.validar_invitacion(p_codigo text, p_club_id uuid DEFAULT NULL)
RETURNS TABLE(club_id uuid, club_nombre text, perfil_deportivo boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo text := trim(COALESCE(p_codigo, ''));
  v_ok_global boolean;
  v_ok_club boolean;
  v_ok_codigo boolean;
BEGIN
  IF length(v_codigo) NOT BETWEEN 3 AND 64 THEN RETURN; END IF;

  v_ok_global := public._consumir_limite_publico('invitacion-global', 'global', 300, 60);
  v_ok_club := public._consumir_limite_publico(
    'invitacion-club', COALESCE(p_club_id::text, 'sin-club'), 300, 600
  );
  v_ok_codigo := public._consumir_limite_publico('invitacion-codigo', v_codigo, 300, 600);
  IF NOT v_ok_global OR NOT v_ok_club OR NOT v_ok_codigo THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id,
         c.nombre::text,
         COALESCE('perfil_deportivo' = ANY(c.modulos_habilitados), false)
  FROM public.invitaciones i
  JOIN public.clubes c ON c.id = i.club_id
  WHERE i.codigo::text = v_codigo
    AND i.activa = true
    AND (p_club_id IS NULL OR i.club_id = p_club_id)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_invitacion(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_invitacion(text, uuid) TO anon, authenticated;


-- ══ 3. crear_solicitud_jugador: cuotas nuevas y los cinco campos ══════════
--
-- Misma función de la 119 con cinco parámetros más al final, todos DEFAULT
-- NULL: las llamadas que ya existen siguen valiendo tal cual.
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
  p_apellido3                     text DEFAULT NULL,
  p_talla_polera                  text DEFAULT NULL,
  p_talla_short                   text DEFAULT NULL,
  p_nivel                         text DEFAULT NULL,
  p_licencia_fechiteme            text DEFAULT NULL,
  p_mano_habil                    text DEFAULT NULL,
  p_estilo_juego                  text DEFAULT NULL,
  p_material                      text DEFAULT NULL
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

  -- Mismos topes que `validar_invitacion`, por el mismo motivo. Si estos dos
  -- números se separan, el formulario deja entrar a gente que después no puede
  -- enviar, que es peor que no dejarla entrar.
  v_ok_club := public._consumir_limite_publico('solicitud-intento-club', p_club_id::text, 300, 600);
  v_ok_codigo := public._consumir_limite_publico(
    'solicitud-intento-codigo', p_club_id::text || ':' || v_codigo, 300, 600
  );
  IF NOT v_ok_club OR NOT v_ok_codigo THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitaciones i
    WHERE i.codigo::text = v_codigo AND i.club_id = p_club_id AND i.activa = true
  ) THEN
    RETURN NULL;
  END IF;

  -- Este se queda en 3 por hora: es por persona, no por club, y es el que
  -- evita que uno solo llene la bandeja de solicitudes.
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
    nombres, apellido1, apellido2, apellido3,
    talla_polera, talla_short,
    nivel, licencia_fechiteme, mano_habil, estilo_juego, material
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
    NULLIF(trim(COALESCE(p_apellido3, '')), ''),
    NULLIF(trim(COALESCE(p_talla_polera, '')), ''),
    NULLIF(trim(COALESCE(p_talla_short, '')), ''),
    NULLIF(trim(COALESCE(p_nivel, '')), ''),
    NULLIF(trim(COALESCE(p_licencia_fechiteme, '')), ''),
    NULLIF(trim(COALESCE(p_mano_habil, '')), ''),
    NULLIF(trim(COALESCE(p_estilo_juego, '')), ''),
    NULLIF(trim(COALESCE(p_material, '')), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- La firma de 18 parámetros (migración 119) queda huérfana: se elimina para
-- que PostgREST no tenga dos candidatas y falle por ambigüedad.
DROP FUNCTION IF EXISTS public.crear_solicitud_jugador(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text);

COMMIT;
