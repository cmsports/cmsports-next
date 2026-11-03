-- Borrar las fichas externas que un torneo eliminado deja huérfanas.
--
-- Al inscribir a alguien escribiendo su nombre, el torneo le crea una ficha
-- `es_externo = true`. Finalizar el torneo la limpia; ELIMINARLO no: borraba
-- partidos, grupos y pagos, y la ficha quedaba como jugador activo sin nada
-- colgando. Así se juntaron las 126 que borró la migración 308 en Buin, y por
-- eso aparecían "1", "55", "sacowea 1"... en Asistencia.
--
-- Quién se puede borrar lo decide esta función y no la aplicación, porque la
-- 308 enseñó el hueco: revisó 26 tablas a mano y había ~30 columnas más con
-- FK hacia jugadores, varias ON DELETE CASCADE, que un DELETE arrastra sin
-- avisar. Acá no hay lista: se leen TODAS las FK hacia jugadores.id desde el
-- catálogo al momento de correr, así que cubre también las tablas que existen
-- en la base y no en el repo, y las que se agreguen después. Una visita que
-- además juega otro torneo, una liga, o tiene cualquier fila en cualquier
-- tabla, se queda.
--
-- Las candidatas se bloquean (FOR UPDATE) antes de revisar: un insert que las
-- referencie en ese instante espera, y no queda una fila apuntando a una ficha
-- recién borrada.
--
-- Solo la llama el servidor con service_role (eliminarTorneoDefinitivo).
-- EJECUCIÓN MANUAL: SQL Editor de Supabase. Aplicada el: ____________
BEGIN;
SELECT _migracion_nueva('309_borrar_externos_sin_vinculos');
SELECT _migracion_para_todos_los_clubes('crea una función; no toca ninguna fila');

CREATE OR REPLACE FUNCTION public.borrar_externos_sin_vinculos(p_club_id uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids      uuid[];
  v_ref      uuid[];
  v_borradas integer;
  r          record;
BEGIN
  IF p_club_id IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Solo externos de ese club. Un socio nunca entra, aunque llegue su id.
  SELECT coalesce(array_agg(id), '{}') INTO v_ids
  FROM (
    SELECT id FROM public.jugadores
    WHERE id = ANY (p_ids) AND club_id = p_club_id AND es_externo = true
    FOR UPDATE
  ) s;

  -- Cada columna que apunta a jugadores.id, sea la tabla que sea.
  FOR r IN
    SELECT c.conrelid::regclass AS tabla, a.attname AS columna
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(att, fatt)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att
    JOIN pg_attribute f ON f.attrelid = c.confrelid AND f.attnum = k.fatt
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.jugadores'::regclass
      AND f.attname = 'id'
  LOOP
    EXIT WHEN cardinality(v_ids) = 0;
    EXECUTE format(
      'SELECT coalesce(array_agg(DISTINCT %1$I), ''{}'') FROM %2$s WHERE %1$I = ANY ($1)',
      r.columna, r.tabla
    ) INTO v_ref USING v_ids;
    v_ids := ARRAY(SELECT unnest(v_ids) EXCEPT SELECT unnest(v_ref));
  END LOOP;

  IF cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.jugadores
  WHERE id = ANY (v_ids) AND club_id = p_club_id AND es_externo = true;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.borrar_externos_sin_vinculos(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_externos_sin_vinculos(uuid, uuid[]) TO service_role;

-- Verificación: la función existe y solo service_role puede llamarla.
SELECT has_function_privilege('authenticated', 'public.borrar_externos_sin_vinculos(uuid, uuid[])', 'EXECUTE') AS authenticated_puede,
       has_function_privilege('service_role',  'public.borrar_externos_sin_vinculos(uuid, uuid[])', 'EXECUTE') AS service_role_puede;

COMMIT;
