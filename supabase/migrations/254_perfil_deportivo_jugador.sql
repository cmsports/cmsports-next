-- ────────────────────────────────────────────────────────────
-- El perfil deportivo del jugador: nivel, mano hábil, estilo y material.
--
-- Este cambio afecta a: **Spinhouse**. El ESQUEMA cambia para todos —cinco
-- columnas nuevas en `jugadores`—, pero todas nacen NULL y ninguna pantalla
-- las muestra sin el módulo 'perfil_deportivo', que solo se enciende acá para
-- Spinhouse. Para Buin esto no existe.
--
-- ══ Qué pide el club ══════════════════════════════════════════════════════
--
-- La ficha del formulario pide, además de lo que ya hay: nivel interno, número
-- de licencia FECHITEME, mano hábil, estilo de juego y material (madera y
-- gomas). Ver `docs/plan-spinhouse-maestro.md` §5.3.
--
-- ══ `nivel` es una columna aparte de `categoria`, y eso importa ═══════════
--
-- Spinhouse cruza DOS ejes: la edad (U11…senior, que sale sola de
-- `fecha_nacimiento`) y el nivel (iniciación / intermedio / competitivo, que lo
-- pone el entrenador). La tentación es concatenarlos en `categoria`
-- —"U15-competitivo"— y con eso se pierde la posibilidad de filtrar por uno
-- solo, que es justamente el filtro que arma los grupos y el que la vista del
-- entrenador usa todo el tiempo. Ver §5.5.
--
-- Por eso `categoria` NO se toca: sigue significando lo mismo que hoy en los
-- seis clubes.
--
-- ══ Lo que este archivo deja AFUERA a propósito ═══════════════════════════
--
-- El plan §5.3 pide tres campos más: clase deportiva paralímpica, necesidades
-- de accesibilidad y autorización de uso de imagen. **No están acá y no es un
-- olvido.** Los dos primeros son datos de SALUD y el tercero es literalmente
-- un registro de consentimiento; la Ley 21.719 rige desde el 2026-12-01 y
-- `docs/plan-ley-21719.md` ya dice cómo tienen que registrarse. Van con ese
-- trabajo o no van.
--
-- Tampoco están las observaciones técnicas. El plan las marca "solo staff", y
-- la RLS de Postgres filtra FILAS, no columnas: una columna en `jugadores` se
-- la lleva el propio jugador cuando pide su ficha. Ese campo necesita su
-- propia tabla, como `feedback_profesores`, y va en su migración.
--
-- Las cinco que sí están son cosas que el jugador puede ver de sí mismo sin
-- problema: con qué mano juega y qué goma usa no es un dato reservado.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
-- La 253 queda libre a propósito: `modulos.ts` ya la tiene anotada como la
-- migración que va a encender el módulo 'retencion' para Spinhouse, y todavía
-- no está escrita.
SELECT _migracion_nueva('254_perfil_deportivo_jugador');
SELECT _migracion_para_club('Spinhouse');


-- ══ 1. Las cinco columnas ═════════════════════════════════════════════════
--
-- Todas nullable y sin DEFAULT: las 700 y tantas fichas que ya existen quedan
-- exactamente como estaban, y una columna NULL no cambia ninguna consulta.
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS nivel              text,
  ADD COLUMN IF NOT EXISTS licencia_fechiteme text,
  ADD COLUMN IF NOT EXISTS mano_habil         text,
  ADD COLUMN IF NOT EXISTS estilo_juego       text,
  ADD COLUMN IF NOT EXISTS material           text;

-- Los dos que son una lista cerrada llevan CHECK. Los otros tres son texto
-- libre a propósito: "penholder chino con revés de pupo largo" no entra en
-- ninguna lista que valga la pena mantener.
--
-- El CHECK acepta NULL: es el estado de todas las fichas de hoy y de las de
-- cualquier club que nunca encienda el módulo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jugadores_nivel_valido'
  ) THEN
    ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_nivel_valido
      CHECK (nivel IS NULL OR nivel IN ('iniciacion', 'intermedio', 'competitivo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jugadores_mano_habil_valida'
  ) THEN
    ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_mano_habil_valida
      CHECK (mano_habil IS NULL OR mano_habil IN ('diestro', 'zurdo'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.jugadores.nivel IS
  'Nivel interno que le pone el entrenador: iniciacion | intermedio | competitivo. Eje INDEPENDIENTE de `categoria`, que es por edad. No concatenar los dos.';
COMMENT ON COLUMN public.jugadores.licencia_fechiteme IS
  'Número de licencia FECHITEME. Texto: el formato lo define la federación, no este sistema.';
COMMENT ON COLUMN public.jugadores.material IS
  'Madera y gomas. Texto libre: no hay catálogo que valga la pena mantener acá.';


-- ══ 2. El módulo, solo para Spinhouse ═════════════════════════════════════
--
-- Es lo único de esta migración que toca una fila, y toca una sola: la de
-- Spinhouse. Buin no aparece en este UPDATE ni por nombre ni por efecto.
--
-- `array_append` sobre el array actual y no una lista escrita a mano: escribir
-- `modulos_habilitados = ARRAY[...]` acá borraría los módulos que el club ya
-- tiene, que es un error que se paga apagándole medio sistema al cliente.
UPDATE public.clubes
SET    modulos_habilitados = array_append(modulos_habilitados, 'perfil_deportivo')
WHERE  nombre = 'Spinhouse'
  AND  NOT ('perfil_deportivo' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Las cinco columnas están y TODAS las fichas las tienen en NULL.
--    Los cinco ceros son la garantía de que ningún jugador cambió.
-- SELECT
--   count(*) FILTER (WHERE nivel              IS NOT NULL) AS con_nivel,
--   count(*) FILTER (WHERE licencia_fechiteme IS NOT NULL) AS con_licencia,
--   count(*) FILTER (WHERE mano_habil         IS NOT NULL) AS con_mano,
--   count(*) FILTER (WHERE estilo_juego       IS NOT NULL) AS con_estilo,
--   count(*) FILTER (WHERE material           IS NOT NULL) AS con_material
-- FROM jugadores;

-- 2) Solo Spinhouse tiene el módulo. Buin tiene que dar false.
-- SELECT nombre, 'perfil_deportivo' = ANY(modulos_habilitados) AS tiene
-- FROM clubes ORDER BY nombre;

-- 3) El CHECK rechaza un nivel inventado y acepta NULL.
-- UPDATE jugadores SET nivel = 'crack' WHERE id = (SELECT id FROM jugadores LIMIT 1);
--   → ERROR:  new row ... violates check constraint "jugadores_nivel_valido"
