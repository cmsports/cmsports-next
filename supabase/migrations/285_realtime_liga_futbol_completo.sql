-- La liga de fútbol publica en realtime todas las tablas que sus pantallas
-- escuchan.
--
-- La 221 publicó seis tablas `lf_*`, pero las pantallas escuchan ocho:
-- `liga-futbol/[id]` escucha `lf_jugadores` y `liga-futbol/[id]/tarjetas`
-- escucha `lf_sanciones`. Suscribirse a una tabla que no está publicada no da
-- error: se conecta, queda escuchando y no llega nada nunca. Es el mismo
-- tropiezo de la 121 y la 142 (ver CLAUDE.md), encontrado en la auditoría del
-- 2026-09-24 cruzando cada `useEnVivo` contra las publicaciones.
--
-- Agrega solo las que falten, así que re-ejecutarla por error no rompe nada
-- (y de todas formas `_migracion_nueva` la ataja).

BEGIN;
SELECT _migracion_nueva('285_realtime_liga_futbol_completo');
SELECT _migracion_para_todos_los_clubes(
  'agrega tablas a la publicación de realtime; no escribe ninguna fila');

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'lf_ligas', 'lf_equipos', 'lf_jugadores', 'lf_partidos',
    'lf_goles', 'lf_tarjetas', 'lf_sanciones', 'lf_fechas'
  ]
  LOOP
    IF to_regclass('public.' || v_tabla) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tabla
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
      RAISE NOTICE 'Publicada en realtime: %', v_tabla;
    END IF;
  END LOOP;
END;
$$;

COMMIT;


-- ── Verificación (solo lee) ───────────────────────────────────────────────
-- Deben salir las ocho.
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename LIKE 'lf_%'
ORDER BY tablename;
