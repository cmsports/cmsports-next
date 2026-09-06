-- ────────────────────────────────────────────────────────────
-- Registro de consentimientos + necesidades de accesibilidad.
--
-- Este cambio afecta a: **todos los clubes en el esquema, ninguno en su
-- comportamiento.** Crea una tabla vacía y agrega una columna que nace en NULL
-- para las 100 % de las filas de los seis clubes. Lo único que se enciende es
-- el módulo, y solo para Spinhouse.
--
-- ══ 1. Por qué esto se hace AHORA y no en diciembre ══════════════════════
--
-- La Ley 21.719 rige desde el 2026-12-01, y la lectura fácil es "faltan tres
-- meses, esperemos". Es al revés, y por una razón concreta: **el club ya
-- publica fotos.** `fotos_galeria` y `jugadores.foto_url` están en producción
-- hace más de un año.
--
-- El día que la ley entre, lo que va a hacer falta no es la autorización de las
-- fotos nuevas: es poder responder por las que YA están publicadas. Y eso solo
-- se puede si el registro existe desde antes. Empezar el 1 de diciembre deja al
-- club con un archivo entero de fotos sin respaldo y sin forma de conseguirlo
-- retroactivamente.
--
-- ══ 2. Por qué es una tabla de solo agregar y no una casilla ═════════════
--
-- La tentación es `jugadores.autoriza_uso_imagen boolean`. Una columna, un
-- checkbox. Responde bien la pregunta fácil —"¿puedo publicar esta foto hoy?"—
-- y pierde la que importa:
--
--     "Esta foto se publicó en marzo. ¿Había autorización EN MARZO?"
--
-- Con una casilla, revocar pisa el valor y esa pregunta se queda sin respuesta.
-- Queda un `false` que no distingue entre "nunca autorizó" y "autorizó,
-- publicamos con permiso, y después se arrepintió" — que es exactamente la
-- diferencia entre haber cumplido y no haberlo hecho.
--
-- Y no hay red debajo: `jugadores` NO tiene trigger de auditoría. Verificado
-- antes de escribir esto — los únicos triggers sobre esa tabla son los de la
-- 110 y la 111, y ninguno registra el valor anterior. El dato viejo no queda en
-- ningún lado.
--
-- Por eso: autorizar inserta una fila, revocar inserta otra, y nada se
-- actualiza ni se borra. Las políticas de abajo lo hacen cumplir — no hay
-- UPDATE ni DELETE para nadie salvo el superadmin.
--
-- ══ 3. Por qué la accesibilidad SÍ va en `jugadores` ═════════════════════
--
-- El perfil técnico (256) fue a su propia tabla porque la RLS filtra filas y no
-- columnas: una nota del entrenador sobre el alumno no la puede leer el alumno.
-- Acá el razonamiento da al revés. "Necesito rampa" es un dato de la persona
-- sobre sí misma: que lo vea en su ficha no es una filtración, es su derecho de
-- acceso. Y el profesor tiene que verlo para poder dictar la clase, que es la
-- finalidad por la que se pide.
--
-- Además el sistema **ya guarda datos de salud en esa tabla**:
-- `indicaciones_medicas`, texto libre, en el formulario de inscripción de los
-- seis clubes desde antes de todo esto. La accesibilidad no abre una categoría
-- nueva; va donde ya está la que existe.
--
-- Va en su propia columna y no dentro de `indicaciones_medicas` porque son
-- preguntas distintas: el profesor que arma la sesión necesita saber quién
-- necesita rampa sin leerse la lista de alergias de todo el grupo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('259_consentimientos_y_accesibilidad');
-- No es de un club: crea una tabla vacía y una columna que nace en NULL para
-- todos. No toca ni una fila existente. Declararlo a propósito, con el motivo.
SELECT _migracion_para_todos_los_clubes('crea una tabla vacía y una columna NULL; no toca filas de ningún club');


-- ══ 1. La tabla ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.jugador_consentimientos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,

  -- Redundante con jugadores.club_id a propósito, igual que en la 256: la RLS
  -- filtra por esta columna y hacerlo con un JOIN en cada política es más lento
  -- y más fácil de escribir mal.
  club_id    uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,

  tipo       text NOT NULL,

  -- true = lo autoriza. false = lo revoca. Las dos son filas nuevas.
  otorgado   boolean NOT NULL,

  -- El día en que la persona FIRMÓ, que puede no ser hoy: el apoderado trae el
  -- papel firmado la semana pasada y el admin lo carga hoy.
  fecha      date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,

  -- Cuándo se cargó en el sistema. No es lo mismo que `fecha` y no es
  -- decorativo: desempata dos firmas del mismo día —autorizar en la mañana,
  -- arrepentirse en la tarde—. Sin esto, cuál gana depende del orden en que la
  -- base devuelva las filas, o sea del azar, en algo que hay que poder
  -- defender frente a un reclamo.
  creado_en  timestamptz NOT NULL DEFAULT now(),

  -- Quién firma. Para un menor de edad no es el alumno: es su apoderado, y la
  -- ley pide poder decir cuál de los dos fue.
  firmado_por text NOT NULL DEFAULT 'jugador',

  -- Quién lo cargó, por NOMBRE y no por FK. `asistencia.registrado_por` es una
  -- FK rota que dejó inutilizables las tres vías de registro, y `movimientos`
  -- usa `registrado_por_nombre` justamente por eso. Un nombre guardado
  -- sobrevive a que la cuenta se borre, que es cuando más importa saberlo.
  registrado_por_nombre text,

  -- Dónde quedó el respaldo: "papel firmado en carpeta", "correo del 3/9".
  nota       text,

  CONSTRAINT jugador_consentimientos_tipo
    CHECK (tipo IN ('uso_imagen')),
  CONSTRAINT jugador_consentimientos_firmado_por
    CHECK (firmado_por IN ('jugador', 'apoderado'))
);

-- El acceso real es "todas las firmas de este alumno, la más reciente primero".
CREATE INDEX IF NOT EXISTS jugador_consentimientos_jugador_idx
  ON public.jugador_consentimientos (jugador_id, tipo, fecha DESC, creado_en DESC);

CREATE INDEX IF NOT EXISTS jugador_consentimientos_club_idx
  ON public.jugador_consentimientos (club_id);

COMMENT ON TABLE public.jugador_consentimientos IS
  'Registro de solo agregar: autorizar inserta una fila, revocar inserta otra. NUNCA hacer UPDATE ni DELETE acá — el valor de la historia es poder reconstruir si había permiso el día en que se publicó una foto, y pisar una fila destruye exactamente eso.';

COMMENT ON COLUMN public.jugador_consentimientos.fecha IS
  'El día en que la persona firmó, que puede ser anterior a la carga. Para saber cuándo se cargó, creado_en.';


-- ══ 2. Las políticas ════════════════════════════════════════════════════
--
-- Tres reglas, y la forma en que están partidas ES el mecanismo de "solo
-- agregar": hay SELECT e INSERT para el staff, y no hay UPDATE ni DELETE para
-- nadie salvo el superadmin. Un `UPDATE` desde la app no da error — afecta 0
-- filas y devuelve éxito—, así que la garantía es que la política no existe.

ALTER TABLE public.jugador_consentimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consentimientos_staff_lee" ON public.jugador_consentimientos;
CREATE POLICY "consentimientos_staff_lee" ON public.jugador_consentimientos
  FOR SELECT
  USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

DROP POLICY IF EXISTS "consentimientos_staff_agrega" ON public.jugador_consentimientos;
CREATE POLICY "consentimientos_staff_agrega" ON public.jugador_consentimientos
  FOR INSERT
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

-- El propio alumno LEE lo suyo. No es una concesión: la ley le da derecho a
-- saber qué autorizó y cuándo. No puede insertar —la autorización la registra
-- el club contra un respaldo— ni borrar.
DROP POLICY IF EXISTS "consentimientos_jugador_lee_lo_suyo" ON public.jugador_consentimientos;
CREATE POLICY "consentimientos_jugador_lee_lo_suyo" ON public.jugador_consentimientos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.jugador_id = jugador_consentimientos.jugador_id
    )
  );

-- El superadmin sí puede todo, incluido borrar: si alguien carga una fila mal
-- —el alumno equivocado, la fecha equivocada— tiene que haber una forma de
-- arreglarlo. Que sea solo él es el punto.
DROP POLICY IF EXISTS "consentimientos_superadmin" ON public.jugador_consentimientos;
CREATE POLICY "consentimientos_superadmin" ON public.jugador_consentimientos
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');


-- ══ 3. Necesidades de accesibilidad ═════════════════════════════════════
--
-- Nace en NULL para las filas de los seis clubes, y NULL es lo que el sistema
-- hace hoy: no preguntar. Sin el módulo encendido el campo no se muestra en
-- ninguna pantalla.

ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS necesidades_accesibilidad text;

COMMENT ON COLUMN public.jugadores.necesidades_accesibilidad IS
  'Qué necesita esta persona para poder entrenar: rampa, intérprete, apoyo para trasladarse. Aparte de indicaciones_medicas porque son preguntas distintas y el profesor que arma la sesión necesita esta sin leerse las alergias del grupo entero.';


-- ══ 4. Realtime ═════════════════════════════════════════════════════════
--
-- Sin esto, una pantalla que se suscriba con `useEnVivo` **no da error**: se
-- conecta, queda escuchando y no llega nada nunca. Mordió dos veces (121 y 142).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jugador_consentimientos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_consentimientos;
  END IF;
END;
$$;


-- ══ 5. El módulo, solo para Spinhouse ═══════════════════════════════════
--
-- `array_append` sobre lo que ya tiene, nunca una lista escrita a mano:
-- asignar `modulos_habilitados = ARRAY[...]` le apagaría los que ya usa.
--
-- Va apagado para los demás **a propósito**, aunque los seis clubes vayan a
-- necesitarlo en diciembre: encenderlo en el club de producción le agrega un
-- panel a la ficha de 140 personas sin que lo haya pedido. Se enciende cuando
-- Buin decida cómo va a juntar las autorizaciones, no en un despliegue.

DO $$
BEGIN
  UPDATE public.clubes
  SET    modulos_habilitados = array_append(modulos_habilitados, 'consentimientos')
  WHERE  nombre ILIKE '%spinhouse%'
    AND  NOT ('consentimientos' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
END;
$$;

COMMIT;


-- ══ Verificación (correr aparte, después del COMMIT) ════════════════════
--
-- 1) La tabla nace vacía. Tiene que dar 0.
-- SELECT count(*) FROM jugador_consentimientos;
--
-- 2) La columna nueva está en NULL para TODOS los clubes. Tiene que dar 0.
-- SELECT count(*) FROM jugadores WHERE necesidades_accesibilidad IS NOT NULL;
--
-- 3) ⚠️ LA IMPORTANTE: que NO exista política de UPDATE ni de DELETE fuera del
--    superadmin. Si acá aparece una, el registro deja de ser confiable.
--    Esperado: SELECT e INSERT para staff, SELECT para el jugador, ALL para
--    superadmin. Nada más.
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'jugador_consentimientos' ORDER BY policyname;
--
-- 4) Está publicada en realtime.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'jugador_consentimientos';
--
-- 5) El módulo quedó solo en Spinhouse. Los otros cinco en false.
-- SELECT nombre, 'consentimientos' = ANY(modulos_habilitados) AS consentimientos
-- FROM   public.clubes ORDER BY nombre;
