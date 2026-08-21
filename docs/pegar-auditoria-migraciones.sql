-- ════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA DE MIGRACIONES — una sola consulta, un solo resultado
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pegar entera en el SQL Editor de Supabase y correr una vez. No escribe nada.
--
-- POR QUÉ MIRA LA BASE Y NO LOS ARCHIVOS
--
-- El repo tiene 200 migraciones y 158 `CREATE FUNCTION`, pero varias funciones
-- están redefinidas 3, 5 y hasta 6 veces: `dashboard_kpis` cinco,
-- `crear_solicitud_jugador` seis. Cada redefinición mata a la anterior, así que
-- el cuerpo escrito en la 002 ya no existe salvo en el archivo. Auditar los
-- archivos es auditar, en gran medida, código muerto.
--
-- Todo lo de acá pregunta por el estado FINAL. Las filas salen agrupadas por
-- sección en la columna `seccion`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

WITH
-- ── 1 ── Migraciones que la base dice tener aplicadas ───────────────────────
-- Comparar contra `ls supabase/migrations`. El registro nació en la 128, así
-- que lo anterior no aparece y eso es esperado. Importa que ninguna posterior
-- falte (se pegó sin registrar) ni sobre (se registró algo que no está).
q1 AS (
  SELECT 12 AS ord, 'MIGRACIONES APLICADAS' AS seccion,
         nombre AS objeto,
         to_char(aplicada_en, 'YYYY-MM-DD HH24:MI') AS detalle,
         aplicada_por AS extra
  FROM _migraciones_aplicadas
),

-- ── 2 ── Inventario real: las funciones que están VIVAS ─────────────────────
-- Si el total es muy menor a 158, confirma cuánto de los archivos es historia.
q2 AS (
  SELECT 13, 'FUNCIONES VIVAS',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'invoker' END,
         length(pg_get_functiondef(p.oid))::text || ' chars'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
),

-- ── 3 ── Funciones vivas que todavía usan la fecha del SERVIDOR ─────────────
-- Acá la auditoría se gana el sueldo. El grep sobre archivos marca ~55 líneas
-- con `current_date`, pero casi todas viven en cuerpos ya reemplazados. Éstas
-- son las que sobrevivieron. Lo ideal es cero filas.
q3 AS (
  SELECT 1, 'FECHA DEL SERVIDOR (UTC)',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'usa current_date/now()::date sin America/Santiago',
         CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'invoker' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* '\mcurrent_date\M|now\(\)::date'
    AND pg_get_functiondef(p.oid) !~* 'America/Santiago'
),

-- ── 4 ── Funciones vivas que leen asistencia sin filtrar por estado ─────────
-- La tabla guarda faltas, así que leerla sin `estado = 'presente'` cuenta
-- ausencias como presencias. Revisar caso a caso: una función que BORRA
-- asistencia legítimamente no filtra.
q4 AS (
  SELECT 2, 'ASISTENCIA SIN estado=presente',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'toca asistencia y no filtra estado',
         CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'invoker' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* '\masistencia\M'
    AND pg_get_functiondef(p.oid) !~* $q$estado\s*=\s*'presente'$q$
),

-- ── 5 ── Funciones vivas sobre tablas multi-club que no nombran club_id ─────
-- Hay cuatro clubes en la misma base. Una función privilegiada que no filtra
-- puede leer o modificar datos de un club ajeno.
q5 AS (
  SELECT 3, 'MULTI-CLUB SIN club_id',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'toca jugadores/movimientos/mensualidades/bloques y no nombra club_id',
         CASE p.prosecdef WHEN true THEN 'DEFINER ⚠' ELSE 'invoker' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* '\m(jugadores|movimientos|mensualidades|bloques_horario)\M'
    AND pg_get_functiondef(p.oid) !~* '\mclub_id\M'
),

-- ── 6 ── SECURITY DEFINER sin search_path fijo ──────────────────────────────
-- Una función DEFINER corre con los permisos de su dueño. Sin `search_path`
-- fijado, quien la llame puede anteponer un esquema propio y hacer que resuelva
-- a SUS tablas. Toda fila acá es un agujero de escalada de privilegios.
q6 AS (
  SELECT 4, 'DEFINER SIN search_path',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         coalesce(array_to_string(p.proconfig, ', '), 'proconfig vacío'),
         CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'función' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.prosecdef
    AND (p.proconfig IS NULL
         OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
),

-- ── 7 ── Tablas sin RLS o sin una sola política ─────────────────────────────
-- En Supabase el cliente habla con Postgres directo. Una tabla expuesta sin
-- RLS la lee cualquiera con la anon key.
q7 AS (
  SELECT 5, 'TABLA SIN RLS O SIN POLÍTICAS',
         c.relname,
         CASE WHEN c.relrowsecurity THEN 'RLS activo' ELSE 'RLS APAGADO ⚠' END,
         (SELECT count(*) FROM pg_policies pol
          WHERE pol.schemaname = 'public' AND pol.tablename = c.relname)::text || ' políticas'
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (NOT c.relrowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policies pol
                        WHERE pol.schemaname = 'public' AND pol.tablename = c.relname))
),

-- ── 8 ── Qué escucha realtime DE VERDAD ─────────────────────────────────────
-- Suscribirse a una tabla no publicada NO da error: se conecta, queda
-- escuchando y no llega nada nunca. Mordió en la 121 y en la 142. Cruzar esta
-- lista contra los `cachedFetch`/`useEnVivo` del frontend.
q8 AS (
  SELECT 10, 'PUBLICADA EN REALTIME', tablename, 'escucha ok', NULL
  FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
),

-- ── 9 ── Tablas de respaldo que quedaron dando vueltas ──────────────────────
-- Cada `_respaldo_*` es una foto vieja de datos reales. Ocupan espacio, y si
-- quedaron sin RLS son una filtración. No borrar sin mirar qué tienen.
q9 AS (
  SELECT 8, 'RESPALDO OLVIDADO',
         c.relname,
         pg_size_pretty(pg_total_relation_size(c.oid)) || ' · ' ||
           coalesce((SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid), 0)::text || ' filas',
         CASE WHEN c.relrowsecurity THEN 'RLS activo' ELSE 'RLS APAGADO ⚠' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (c.relname LIKE '\_respaldo%' OR c.relname LIKE '%backup%' OR c.relname LIKE '%\_bkp%')
),

-- ── 10 ── Triggers vivos ────────────────────────────────────────────────────
-- La lógica más fácil de olvidar: no aparecen en ningún llamado del frontend
-- y disparan solos.
q10 AS (
  SELECT 11, 'TRIGGER',
         c.relname || ' · ' || t.tgname,
         p.proname || '()',
         CASE WHEN t.tgenabled = 'D' THEN 'DESHABILITADO ⚠' ELSE 'activo' END
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
),

-- ── 11 ── Tablas sensibles que NO tienen ningún trigger ─────────────────────
-- `movimientos` es la tabla de la plata y no tiene uno solo: la migración 110
-- puso `check_jugador_club_coincide` en asistencia, mensualidades y
-- clases_extraordinarias, y la dejó afuera. El rastro en `audit_log` lo
-- escriben los RPC a mano, así que un UPDATE directo no deja huella — y ese
-- rastro es lo que salvó la recuperación de julio.
q11 AS (
  SELECT 6, 'TABLA SENSIBLE SIN TRIGGERS',
         c.relname,
         'ningún trigger la vigila',
         CASE WHEN c.relrowsecurity THEN 'solo la protege RLS' ELSE 'y RLS APAGADO ⚠⚠' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('movimientos','mensualidades','audit_log','jugadores',
                      'asistencia','clases_extraordinarias','bloque_jugadores')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)
),

-- ── 12 ── Políticas RLS de las tablas de plata ──────────────────────────────
-- Si `movimientos` no tiene triggers, esto es lo único que queda impidiendo
-- que el cliente escriba plata a mano saltándose los RPC.
q12 AS (
  SELECT 9, 'RLS TABLAS DE PLATA',
         pol.tablename || ' · ' || pol.policyname,
         pol.cmd || ' · roles ' || pol.roles::text,
         'USING ' || coalesce(pol.qual, '—') || ' | CHECK ' || coalesce(pol.with_check, '—')
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
    AND pol.tablename IN ('movimientos','mensualidades','audit_log')
),

-- ── 13 ── Objetos en `public` que no son funciones normales ─────────────────
-- Ninguna de las 200 migraciones tiene un `CREATE AGGREGATE`. Si acá aparece
-- algo, llegó a la base por otro camino: pegado a mano, o una extensión que
-- instala en `public` en vez de su propio esquema. Eso es deriva
-- archivos-vs-base, que es justo lo que esta auditoría busca.
q13 AS (
  SELECT 7, 'NO ES FUNCIÓN NORMAL',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         CASE p.prokind WHEN 'a' THEN 'agregación' WHEN 'w' THEN 'ventana'
                        WHEN 'p' THEN 'procedure' ELSE p.prokind::text END,
         coalesce(e.extname, 'SIN EXTENSIÓN ⚠')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
  LEFT JOIN pg_extension e ON e.oid = d.refobjid
  WHERE n.nspname = 'public' AND p.prokind <> 'f'
),

todo AS (
  SELECT * FROM q1  UNION ALL SELECT * FROM q2  UNION ALL SELECT * FROM q3
  UNION ALL SELECT * FROM q4  UNION ALL SELECT * FROM q5  UNION ALL SELECT * FROM q6
  UNION ALL SELECT * FROM q7  UNION ALL SELECT * FROM q8  UNION ALL SELECT * FROM q9
  UNION ALL SELECT * FROM q10 UNION ALL SELECT * FROM q11 UNION ALL SELECT * FROM q12
  UNION ALL SELECT * FROM q13
)
SELECT seccion, objeto, detalle, extra
FROM todo
ORDER BY ord, objeto;
