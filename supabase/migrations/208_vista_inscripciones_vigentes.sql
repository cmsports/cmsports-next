-- ============================================================================
-- CmSports — `bloque_jugadores_vigentes`: que el default sea el correcto
-- ============================================================================
--
-- ── El problema ───────────────────────────────────────────────────────────
-- `bloque_jugadores` guarda también las inscripciones cerradas: cuando un
-- jugador cambia de grupo, la fila vieja no se borra, se le pone
-- `vigente_hasta`. Entonces toda consulta que quiera "los grupos de hoy"
-- tiene que acordarse de filtrar `vigente_hasta IS NULL`.
--
-- Acordarse no funcionó. El 2026-08-20 se agregó el filtro por grupo al
-- módulo de feedback y las dos consultas nuevas salieron sin ese filtro
-- (`PanelFeedback.tsx`, `ModalCrearFeedback.tsx`). Resultado: 19 jugadores
-- aparecían en grupos que ya habían dejado —Erik Rubio seguía listado en
-- Menores Formativo Intermedio un mes después de pasarse a Adulto - Master—
-- y el filtro por grupo devolvía gente que ya no estaba ahí.
--
-- Lo grave no es el olvido, es que **no falla**: la consulta sin filtro es
-- SQL perfectamente válido, no da error, no aparece en consola, y la etiqueta
-- que pinta es plausible. Solo lo detecta alguien que conozca al jugador. Es
-- la misma forma de las otras trampas del proyecto (`asistencia` guarda
-- faltas; suscribirse a una tabla no publicada en realtime no avisa nunca):
-- código válido, resultado silenciosamente equivocado.
--
-- ── La solución ───────────────────────────────────────────────────────────
-- La misma idea que `_migracion_nueva()`: no recordar, impedir. Una vista con
-- el filtro adentro hace que **el default sea correcto**, y traer las
-- inscripciones cerradas pase a ser una decisión explícita —hay que ir a
-- buscar la tabla cruda a propósito—, no un olvido.
--
-- ── security_invoker ──────────────────────────────────────────────────────
-- OBLIGATORIO. En Postgres una vista corre con los permisos de su dueño y NO
-- aplica el RLS de la tabla que consulta, salvo que se le pida. La migración
-- 137 tuvo que tapar exactamente eso en `division_ranking`, que entregaba
-- nombres y estadísticas de todos los clubes a cualquiera con la llave
-- pública, sin sesión. Una vista sobre `bloque_jugadores` sin
-- `security_invoker` sería la misma fuga otra vez.
--
-- ── Ojo con realtime ──────────────────────────────────────────────────────
-- Las vistas NO se publican en `supabase_realtime`. Las pantallas siguen
-- suscribiéndose a la TABLA `bloque_jugadores` con `useEnVivo`; solo cambian
-- de dónde LEEN. No cambiar el nombre en las llamadas a `useEnVivo`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

SELECT _migracion_nueva('208_vista_inscripciones_vigentes');


-- ══ 1. La vista ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.bloque_jugadores_vigentes AS
  SELECT *
  FROM public.bloque_jugadores
  WHERE vigente_hasta IS NULL;

-- Sin esto la vista se salta el RLS de `bloque_jugadores` y expone las
-- inscripciones de todos los clubes. Ver el encabezado y la migración 137.
ALTER VIEW public.bloque_jugadores_vigentes SET (security_invoker = on);

COMMENT ON VIEW public.bloque_jugadores_vigentes IS
  'Inscripciones abiertas (vigente_hasta IS NULL). Es la fuente por defecto '
  'para "en qué grupos está hoy este jugador". La tabla cruda incluye las '
  'inscripciones cerradas y solo debe usarse para historial o para escribir. '
  'security_invoker=on: sin eso la vista se saltaría el RLS (ver migración 137).';

COMMIT;


-- ── Verificación ────────────────────────────────────────────────────────────
-- Correr DESPUÉS del COMMIT. Los tres deben dar lo esperado.

-- 1) La vista tiene que quedar con security_invoker=on.
--    Si `reloptions` sale NULL, la vista está filtrando datos de otros clubes.
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'bloque_jugadores_vigentes';

-- 2) La vista tiene que traer menos filas que la tabla: la diferencia son las
--    inscripciones ya cerradas.
SELECT
  (SELECT count(*) FROM public.bloque_jugadores)            AS filas_tabla,
  (SELECT count(*) FROM public.bloque_jugadores_vigentes)   AS filas_vista,
  (SELECT count(*) FROM public.bloque_jugadores
     WHERE vigente_hasta IS NOT NULL)                       AS cerradas;

-- 3) El caso que originó la migración: Erik Rubio Rubio debe aparecer SOLO en
--    bloques "Adulto - Master" (lun, mié, jue), y no en Menores.
SELECT b.nombre, b.dia_semana, b.hora_inicio
FROM public.bloque_jugadores_vigentes bjv
JOIN public.bloques_horario b ON b.id = bjv.bloque_id
WHERE bjv.jugador_id = 'b8037838-d7be-4836-917d-bf9e0cefdb5a'
ORDER BY b.nombre, b.dia_semana;
