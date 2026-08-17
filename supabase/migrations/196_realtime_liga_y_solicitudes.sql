-- Tres tablas que el código escucha en vivo y que nunca se publicaron en
-- `supabase_realtime`. Suscribirse a una tabla no publicada NO da error: el
-- canal se conecta, queda escuchando y no llega nada nunca. Es la misma trampa
-- que ya mordió con la 121 y la 142.
--
-- Se detectó comparando las tablas que el código escucha contra el resultado
-- real de `pg_publication_tables` en producción:
--
--   · liga_partidos       → src/components/liga/TableroFecha.tsx
--   · liga_fechas         → src/components/liga/TableroFecha.tsx
--   · solicitudes_jugador → src/components/campana-notificaciones.tsx
--
-- Qué estaba roto en la práctica:
--   · El tablero de una fecha de liga no se actualizaba solo. Quien anota un
--     resultado lo ve, pero el resto de las pantallas abiertas se quedaban con
--     el marcador viejo hasta recargar a mano — justo lo contrario de para lo
--     que existe un tablero.
--   · La campana de notificaciones no avisaba de una solicitud nueva para
--     unirse al club. La solicitud entraba y quedaba esperando a que alguien
--     recargara la pantalla.
--
-- Las tablas `tecnico_*` también están mudas (ocho), pero se dejan así a
-- propósito: el módulo técnico no se va a usar.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('196_realtime_liga_y_solicitudes');

-- `ADD TABLE` revienta si la tabla ya está en la publicación, y esta migración
-- puede llegar a una base donde alguien ya la agregó desde el panel. Se agrega
-- una por una y solo si falta.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['liga_partidos', 'liga_fechas', 'solicitudes_jugador'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'publicada: %', t;
    ELSE
      RAISE NOTICE 'ya estaba publicada: %', t;
    END IF;
  END LOOP;
END $$;

-- Realtime necesita saber qué fila cambió. Con REPLICA IDENTITY DEFAULT solo
-- viaja la clave primaria en UPDATE y DELETE, que es lo que estas pantallas
-- necesitan para recargar. Se deja constancia de que las tres tienen PK.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['liga_partidos', 'liga_fechas', 'solicitudes_jugador'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND i.indisprimary
    ) THEN
      RAISE EXCEPTION 'La tabla % no tiene clave primaria: realtime no podría identificar la fila.', t;
    END IF;
  END LOOP;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Las tres tienen que aparecer acá.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('liga_partidos', 'liga_fechas', 'solicitudes_jugador')
ORDER BY tablename;
