-- ────────────────────────────────────────────────────────────
-- club_config: las diferencias entre clubes son dato, no código.
--
-- Este cambio afecta a: TODOS los clubes. Es infraestructura pura — crea una
-- tabla VACÍA y no escribe ni una fila de ningún club. Mientras nadie inserte
-- nada acá, absolutamente todo se comporta igual que antes.
--
-- ══ Qué problema resuelve ═════════════════════════════════════════════════
--
-- Hoy `clubes.modulos_habilitados` sabe PRENDER Y APAGAR módulos completos:
-- Torneos sí, Liga no. Lo que no sabe es que dos clubes usen el mismo módulo
-- CON REGLAS DISTINTAS:
--
--     regla                    Buin              Spinhouse
--     ─────────────────────────────────────────────────────────
--     cupo de un bloque        número a mano     mesas × por mesa
--     mensualidad              monto libre       plan
--     bloqueo por morosidad    nunca, manual     a los 30 días
--
-- Sin esta tabla, la única forma de programar eso es un
-- `if (club_id = '2d8e…')` en código compartido — que `CLAUDE.md` prohíbe, y
-- con razón: ata a los tres clubes al mismo archivo, y cada vez que Spinhouse
-- pida algo hay que editar código que Buin usa todos los días.
--
-- ══ La regla que protege a Buin ═══════════════════════════════════════════
--
-- **El default de cada clave es el comportamiento actual de Buin.** Un club
-- sin ninguna fila acá se comporta EXACTAMENTE como hoy. Por eso esta
-- migración puede entrar sin tocar nada, y por eso el criterio de aceptación
-- es que la suite de pruebas pase SIN MODIFICARSE.
--
-- Los defaults viven en `src/lib/domain/clubConfig.ts`, no en esta tabla: la
-- tabla guarda solo lo que un club decidió cambiar. Una clave ausente no es un
-- error, es "usa el default".
--
-- ══ Lo que NO va acá ══════════════════════════════════════════════════════
--
-- La tabla guarda ELECCIONES, no comportamientos. Si una diferencia entre
-- clubes no se puede expresar como un valor —un número, una opción de una
-- lista cerrada, un sí/no—, no va acá: va como módulo aparte. Meter lógica
-- dentro de un `jsonb` es reinventar el `if` con más pasos y sin tipos.
--
-- Ver `docs/plan-aislamiento-clubes.md` §5 Fase C, y
-- `docs/plan-spinhouse-maestro.md` §4.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('248_club_config');
SELECT _migracion_para_todos_los_clubes(
  'crea la tabla de configuración por club; la deja vacía y no toca filas de nadie');


-- ══ 1. La tabla ═══════════════════════════════════════════════════════════
--
-- Clave-valor por club. `valor` es jsonb y no text porque las claves no son
-- todas del mismo tipo: hay enteros (días de morosidad), opciones de una lista
-- cerrada (modo de cupo) y listas ordenadas (orden de desempate). El catálogo
-- de TypeScript es el que sabe qué forma tiene cada una y valida al leer.
CREATE TABLE IF NOT EXISTS public.club_config (
  club_id         uuid        NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  clave           text        NOT NULL,
  valor           jsonb       NOT NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  PRIMARY KEY (club_id, clave),

  -- La clave se parece a 'cupos.modo' o 'morosidad.dias_bloqueo': minúsculas,
  -- guion bajo y punto para agrupar. Sin esto, un typo con mayúscula crea una
  -- fila hermana que nadie lee nunca y que no se ve distinta en una tabla.
  CONSTRAINT club_config_clave_formato
    CHECK (clave ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$')
);

COMMENT ON TABLE public.club_config IS
  'Diferencias de comportamiento entre clubes, como dato. Una clave ausente significa "usa el default", que vive en src/lib/domain/clubConfig.ts y es siempre el comportamiento actual de Buin.';

COMMENT ON COLUMN public.club_config.valor IS
  'jsonb porque las claves no son del mismo tipo: enteros, opciones de lista cerrada y listas ordenadas. El catálogo de TypeScript valida la forma al leer.';


-- ══ 2. Quién lee y quién escribe ══════════════════════════════════════════
ALTER TABLE public.club_config ENABLE ROW LEVEL SECURITY;

-- LECTURA: cualquiera de su club, con cualquier rol.
--
-- Tiene que ser así de ancho: la config decide cómo se PINTA la pantalla del
-- alumno tanto como la del admin (si su cupo se muestra en mesas, si su cuota
-- se llama plan). Una política que solo dejara leer al staff dejaría al alumno
-- viendo siempre el comportamiento por defecto, que en un club configurado
-- sería sencillamente el equivocado.
--
-- Y no hay nada sensible acá: son ajustes del club, no datos de personas.
DROP POLICY IF EXISTS "club_config_lectura" ON public.club_config;
CREATE POLICY "club_config_lectura" ON public.club_config
  FOR SELECT
  USING (club_id = get_my_club_id() OR get_my_rol() = 'superadmin');

-- ESCRITURA: superadmin y nadie más.
--
-- Hay claves acá que mueven plata (el modo de mensualidad) y otras que
-- bloquean personas (los días de morosidad). Empezar cerrado y abrir después
-- es reversible; al revés no. Cuando el club necesite tocar algo suyo se le
-- abre esa clave, no la tabla.
DROP POLICY IF EXISTS "club_config_escritura" ON public.club_config;
CREATE POLICY "club_config_escritura" ON public.club_config
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');


-- ══ 3. Rastro de quién la cambió ══════════════════════════════════════════
-- Cambiar `morosidad.dias_bloqueo` no es un ajuste cualquiera: bloquea gente.
-- Que la fila diga cuándo y quién la tocó es lo mínimo, y es gratis.
CREATE OR REPLACE FUNCTION public._club_config_sella()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_en  := now();
  NEW.actualizado_por := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_config_sella ON public.club_config;
CREATE TRIGGER club_config_sella
  BEFORE INSERT OR UPDATE ON public.club_config
  FOR EACH ROW EXECUTE FUNCTION public._club_config_sella();


-- ══ 4. Realtime ═══════════════════════════════════════════════════════════
--
-- Sin esto, `useEnVivo` sobre esta tabla se conecta, queda escuchando y NO
-- LLEGA NADA NUNCA, sin dar error. Ya mordió dos veces (migraciones 121 y 142)
-- y la segunda dejó `movimientos`, `perfiles` y `credencial_visible` mudas.
--
-- El DO block es porque `ADD TABLE` revienta si la tabla ya está publicada, y
-- esta migración tiene que poder correrse en una base donde alguien ya la
-- agregó a mano.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'club_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.club_config;
  END IF;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) La tabla quedó vacía. Tiene que decir 0.
--    Ese 0 es la garantía de que ningún club cambió de comportamiento.
-- SELECT count(*) AS filas FROM club_config;

-- 2) Las dos políticas están.
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'club_config' ORDER BY policyname;

-- 3) Está publicada en realtime.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'club_config';

-- 4) El CHECK del formato de clave funciona: esto DEBE fallar.
-- INSERT INTO club_config (club_id, clave, valor)
-- VALUES ((SELECT id FROM clubes LIMIT 1), 'Cupos.Modo', '"numero"'::jsonb);
