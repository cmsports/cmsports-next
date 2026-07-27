-- Repone los índices que se perdieron al cambiar las claves primarias.
--
-- En la 086, para que alguien pudiera entrar a un grupo, salir y volver, la
-- clave primaria de `bloque_jugadores` pasó de (bloque_id, jugador_id) a un id
-- propio. Con la clave vieja se fue su índice, que era el único que cubría
-- `bloque_id`. Lo mismo en `bloque_profesores`.
--
-- El índice parcial que quedó solo cubre las filas abiertas, así que todo lo
-- histórico —el calendario del año, los reportes por período— pasó a recorrer
-- la tabla entera. Y peor: las políticas de seguridad de esas tablas preguntan
-- `EXISTS (SELECT 1 FROM bloques_horario WHERE id = bloque_id ...)` en cada
-- fila, así que sin índice esa comprobación se paga completa en cada consulta.
--
-- Se agregan además dos índices para las consultas que el módulo nuevo hace
-- todo el tiempo y que hoy no tienen ninguno.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

-- ── Lo que se perdió con las claves viejas ────────────────────────────────
CREATE INDEX IF NOT EXISTS bloque_jugadores_bloque_idx
  ON bloque_jugadores (bloque_id);

CREATE INDEX IF NOT EXISTS bloque_profesores_bloque_idx
  ON bloque_profesores (bloque_id);

CREATE INDEX IF NOT EXISTS bloque_profesores_profesor_idx
  ON bloque_profesores (profesor_id);

-- ── Lo que pide el módulo nuevo ───────────────────────────────────────────
-- El horario y los cupos filtran los bloques vigentes del club una y otra vez.
CREATE INDEX IF NOT EXISTS bloques_horario_club_vigencia_idx
  ON bloques_horario (club_id, vigente_desde, vigente_hasta);

-- El calendario pregunta por las excepciones de un rango de fechas.
CREATE INDEX IF NOT EXISTS bloque_excepciones_bloque_fecha_idx
  ON bloque_excepciones (bloque_id, fecha);

-- Las mensualidades históricas leen el año completo de un jugador.
CREATE INDEX IF NOT EXISTS mensualidades_jugador_anio_idx
  ON mensualidades (jugador_id, anio);

COMMIT;


-- ── Verificación: los seis tienen que estar ───────────────────────────────
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'bloque_jugadores_bloque_idx',
    'bloque_profesores_bloque_idx',
    'bloque_profesores_profesor_idx',
    'bloques_horario_club_vigencia_idx',
    'bloque_excepciones_bloque_fecha_idx',
    'mensualidades_jugador_anio_idx'
  )
ORDER BY indexname;
