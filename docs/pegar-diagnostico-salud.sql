-- ═══════════════════════════════════════════════════════════════════════════
--  DIAGNÓSTICO DE SALUD DE LA BASE — cmsports
--
--  Pegar entero en el SQL Editor de Supabase y ejecutar.
--  Es SOLO LECTURA: no modifica ni una fila. Se puede correr cuantas veces
--  se quiera, en cualquier momento.
--
--  Devuelve una tabla con los problemas encontrados, ordenados por gravedad.
--  Si devuelve CERO filas, la base está sana en todo lo que este script mira.
--
--  Cubre tres frentes:
--    · Seguridad            — lo que expondría datos
--    · Integridad           — lo que puede romper o corromper
--    · Reglas del proyecto  — lo que el CLAUDE.md exige y es fácil olvidar
-- ═══════════════════════════════════════════════════════════════════════════

WITH

-- ── 1. Tablas sin RLS ─────────────────────────────────────────────────────
-- Sin RLS, lo único que protege la tabla son los permisos de PostgREST. Un
-- GRANT descuidado la abre entera. Fue el caso de las tablas _respaldo_*.
sin_rls AS (
  SELECT '1 CRITICO' AS gravedad,
         'Tabla sin RLS' AS problema,
         c.relname::text AS objeto,
         'un GRANT a anon la dejaria publica' AS detalle
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
),

-- ── 2. Políticas abiertas a anon o public ─────────────────────────────────
politica_anon AS (
  SELECT '1 CRITICO',
         'Politica abierta a anon/public',
         (cls.relname || '.' || pol.polname)::text,
         ('roles: ' || array_to_string(ARRAY(
            SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles)), ', '))::text
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = cls.relnamespace
  WHERE n.nspname = 'public'
    AND EXISTS (
      SELECT 1 FROM pg_roles r
      WHERE r.oid = ANY(pol.polroles) AND r.rolname IN ('anon', 'public')
    )
),

-- ── 3. Políticas que dejan pasar todo ─────────────────────────────────────
-- No siempre es un error (puede haber una tabla pública a propósito), pero
-- siempre merece una segunda mirada.
politica_true AS (
  SELECT '2 REVISAR',
         'Politica con USING (true)',
         (cls.relname || '.' || pol.polname)::text,
         'deja pasar todas las filas a quien alcance la politica'::text
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = cls.relnamespace
  WHERE n.nspname = 'public'
    AND btrim(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) = 'true'
),

-- ── 4. SECURITY DEFINER sin search_path ───────────────────────────────────
-- Corre con privilegios elevados pero resuelve los nombres de tabla usando el
-- search_path de QUIEN LA LLAMA. Vector clásico de suplantación de tablas.
-- Se excluyen las de extensiones: no son del proyecto y no se pueden alterar.
definer_suelta AS (
  SELECT '1 CRITICO',
         'SECURITY DEFINER sin search_path',
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
         'podria leer tablas suplantadas por quien la invoque'::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )
),

-- ── 5. auth.uid() sin envolver ────────────────────────────────────────────
-- Se evalúa una vez POR FILA en vez de una vez por consulta.
auth_suelto AS (
  SELECT '3 RENDIMIENTO',
         'auth.uid() sin (select ...)',
         (cls.relname || '.' || pol.polname)::text,
         'se evalua una vez por fila en vez de una por consulta'::text
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = cls.relnamespace
  WHERE n.nspname = 'public'
    AND (
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ 'auth\.uid\(\)'
      OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'auth\.uid\(\)'
    )
    AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        !~ '\( SELECT auth\.uid\(\)'
),

-- ── 6. Tablas sin clave primaria ──────────────────────────────────────────
sin_pk AS (
  SELECT '2 REVISAR',
         'Tabla sin clave primaria',
         c.relname::text,
         'sin PK no hay forma sencilla de corregir una fila puntual'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)
),

-- ── 7. Publicada en realtime pero sin PK ──────────────────────────────────
-- Emite eventos que el cliente no puede aplicar: no sabe qué fila cambió.
realtime_sin_pk AS (
  SELECT '2 REVISAR',
         'Publicada en realtime sin PK',
         pt.tablename::text,
         'los UPDATE/DELETE llegan sin identificar la fila'::text
  FROM pg_publication_tables pt
  WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n2 ON n2.oid = c.relnamespace
      WHERE n2.nspname = 'public' AND c.relname = pt.tablename AND i.indisprimary
    )
),

-- ── 8. REGLA DEL PROYECTO: fechas en hora de Chile ────────────────────────
-- El CLAUDE.md es explícito: current_date da el día UTC y descuadra la fecha.
-- Debe usarse (now() AT TIME ZONE 'America/Santiago')::date.
fecha_utc AS (
  SELECT '2 REVISAR',
         'Funcion usa current_date (da hora UTC)',
         p.proname::text,
         'deberia usar now() AT TIME ZONE America/Santiago'::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND pg_get_functiondef(p.oid) ~* '[^_a-z]current_date[^_a-z]'
    AND pg_get_functiondef(p.oid) !~* 'America/Santiago'
),

-- ── 9. REGLA DEL PROYECTO: ingreso de mensualidad sin su pago ─────────────
-- Todo ingreso de cuota nace de un pago y queda atado a él. Uno suelto es
-- plata en el libro sin el pago que la originó.
movimiento_huerfano AS (
  SELECT '1 CRITICO',
         'Ingreso de mensualidad sin mensualidad_id',
         (count(*)::text || ' movimientos'),
         'plata en Finanzas sin el pago que la origino'::text
  FROM movimientos
  WHERE categoria = 'mensualidad' AND mensualidad_id IS NULL
  HAVING count(*) > 0
),

-- ── 10. REGLA DEL PROYECTO: cuota pagada que no entró al libro ────────────
-- El espejo del anterior.
pago_sin_ingreso AS (
  SELECT '1 CRITICO',
         'Mensualidad pagada sin movimiento',
         (count(*)::text || ' mensualidades'),
         'figuran pagadas pero no hay ingreso en Finanzas'::text
  FROM mensualidades m
  WHERE m.estado = 'pagado'
    AND NOT EXISTS (SELECT 1 FROM movimientos mo WHERE mo.mensualidad_id = m.id)
  HAVING count(*) > 0
),

-- ── 11. REGLA DEL PROYECTO: jugador repetido en el MISMO dia ─────────────
-- Ojo: tener varios bloques vigentes es NORMAL —uno por cada dia que entrena—,
-- asi que contar bloques a secas no dice nada. Lo que si es un error es estar
-- dos veces en el MISMO dia: eso descuadra la lista de asistencia de esa
-- jornada. (La primera version de este chequeo marcaba 116 jugadores sanos.)
mismo_dia_repetido AS (
  SELECT '2 REVISAR',
         'Jugador con 2 bloques el mismo dia',
         (count(*)::text || ' casos'),
         'descuadra la lista de asistencia de esa jornada'::text
  FROM (
    SELECT bj.jugador_id, bh.dia_semana
    FROM bloque_jugadores bj
    JOIN bloques_horario bh ON bh.id = bj.bloque_id
    WHERE bj.vigente_hasta IS NULL AND bh.vigente_hasta IS NULL
    GROUP BY bj.jugador_id, bh.dia_semana
    HAVING count(*) > 1
  ) q
  HAVING count(*) > 0
),

-- ── 12. CENTINELA: cerrar vigencia con hoy ───────────────────────────────
-- Generaliza el bug de traspasar_jugador (migracion 202). vigente_hasta es el
-- ULTIMO dia en que vale, asi que cerrar con hoy deja a la persona viva hasta
-- medianoche y aparece en dos bloques a la vez. Se cierra con AYER.
cierre_con_hoy AS (
  SELECT '2 REVISAR',
         'Funcion cierra vigencia con hoy (debe ser ayer)',
         p.proname::text,
         'cerrar con hoy no saca a nadie: ver src/lib/domain/vigencia.ts'::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND pg_get_functiondef(p.oid) ~* 'vigente_hastas*=s*(current_date|now())'
),

-- ── 13. CENTINELA: fechas de vigencia invertidas ─────────────────────────
-- Si aparece, algo cerro una fila antes de que empezara a valer.
vigencia_invertida AS (
  SELECT '1 CRITICO',
         'Vigencia con fechas invertidas',
         (count(*)::text || ' filas en bloque_jugadores'),
         'vigente_hasta anterior a vigente_desde'::text
  FROM bloque_jugadores
  WHERE vigente_hasta IS NOT NULL AND vigente_hasta < vigente_desde
  HAVING count(*) > 0
),

-- ── 14. CENTINELA: respaldos con politica de acceso ──────────────────────
-- Las tablas _respaldo_* guardan la plata rescatada del desastre de la 089.
-- No deben tener ninguna politica: solo se leen con la service key, que se
-- salta RLS. Una politica ahi es una puerta que no deberia existir.
respaldo_con_politica AS (
  SELECT '1 CRITICO',
         'Tabla de respaldo con politica de acceso',
         (cls.relname || '.' || pol.polname)::text,
         'los respaldos no se leen por la API, solo con service_role'::text
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = cls.relnamespace
  WHERE n.nspname = 'public' AND cls.relname LIKE '_respaldo_%'
)

SELECT * FROM sin_rls
UNION ALL SELECT * FROM politica_anon
UNION ALL SELECT * FROM politica_true
UNION ALL SELECT * FROM definer_suelta
UNION ALL SELECT * FROM auth_suelto
UNION ALL SELECT * FROM sin_pk
UNION ALL SELECT * FROM realtime_sin_pk
UNION ALL SELECT * FROM fecha_utc
UNION ALL SELECT * FROM movimiento_huerfano
UNION ALL SELECT * FROM pago_sin_ingreso
UNION ALL SELECT * FROM mismo_dia_repetido
UNION ALL SELECT * FROM cierre_con_hoy
UNION ALL SELECT * FROM vigencia_invertida
UNION ALL SELECT * FROM respaldo_con_politica
ORDER BY 1, 2, 3;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONSULTA APARTE — correr por separado, DESPUES de la de arriba.
--
--  Va suelta a proposito: lee auth.users, y si tu version de Supabase no
--  tuviera la columna is_anonymous, esto falla. Dentro de la consulta
--  principal, ese fallo se llevaria puestos los otros 14 chequeos.
--
--  Que busca: el codigo NUNCA llama signInAnonymously (verificado con grep
--  sobre todo src/). Si aparecen usuarios anonimos, es que el inicio de
--  sesion anonimo esta prendido en el panel y alguien lo uso.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT count(*) AS usuarios_anonimos,
       CASE WHEN count(*) > 0
            THEN 'Revisar Authentication > Sign In / Providers'
            ELSE 'sin usuarios anonimos' END AS que_hacer
FROM auth.users
WHERE is_anonymous IS TRUE;
