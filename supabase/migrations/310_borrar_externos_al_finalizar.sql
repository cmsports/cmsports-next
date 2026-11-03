-- Finalizar un torneo también borra sus externos con la función de la 309.
--
-- `limpiarExternosDeTorneo` (al finalizar) borraba las fichas con un DELETE
-- directo. Elegía bien a quién —sin podio, sin otros torneos, sin partidos con
-- resultado— pero no miraba nada fuera de los torneos: una visita que además
-- juega una liga perdía sus partidos de liga por el ON DELETE CASCADE de
-- liga_partidos y liga_division_jugadores. Mismo hueco que la 308.
--
-- La función de la 309 no sirve tal cual para esto: al finalizar, la ficha
-- todavía figura en los partidos SIN JUGAR de ese mismo torneo, en sus cabezas
-- de serie y en sus felicitaciones, y eso la protegería siempre. Esas tres
-- referencias son justamente las que el DELETE de antes limpiaba a propósito
-- (SET NULL en torneo_partidos, CASCADE en las otras dos). Por eso se agrega
-- `p_ignorar_torneo`: SOLO esas referencias, SOLO de ese torneo, dejan de
-- contar. Un partido de ese torneo CON resultado sigue contando, y también
-- todo lo demás (pagos del torneo incluidos).
--
-- Se borra la firma de dos argumentos y se crea la de tres con default NULL:
-- dejar las dos haría ambigua la llamada de dos argumentos que ya está en
-- producción (eliminarTorneoDefinitivo), que sigue funcionando igual.
-- EJECUCIÓN MANUAL: SQL Editor de Supabase. Aplicada el: ____________
BEGIN;
SELECT _migracion_nueva('310_borrar_externos_al_finalizar');
SELECT _migracion_para_todos_los_clubes('reemplaza una función; no toca ninguna fila');

DROP FUNCTION public.borrar_externos_sin_vinculos(uuid, uuid[]);

CREATE FUNCTION public.borrar_externos_sin_vinculos(
  p_club_id uuid,
  p_ids uuid[],
  p_ignorar_torneo uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids       uuid[];
  v_ref       uuid[];
  v_borradas  integer;
  v_excepcion text;
  r           record;
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
    SELECT c.conrelid AS tabla_oid, c.conrelid::regclass AS tabla, a.attname AS columna
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(att, fatt)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att
    JOIN pg_attribute f ON f.attrelid = c.confrelid AND f.attnum = k.fatt
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.jugadores'::regclass
      AND f.attname = 'id'
  LOOP
    EXIT WHEN cardinality(v_ids) = 0;

    v_excepcion := '';
    IF p_ignorar_torneo IS NOT NULL THEN
      IF r.tabla_oid = 'public.torneo_partidos'::regclass THEN
        v_excepcion := ' AND NOT (torneo_id = $2 AND ganador IS NULL)';
      ELSIF r.tabla_oid IN ('public.torneo_cabezas_serie'::regclass,
                            'public.torneo_felicitaciones'::regclass) THEN
        v_excepcion := ' AND torneo_id IS DISTINCT FROM $2';
      END IF;
    END IF;

    EXECUTE format(
      'SELECT coalesce(array_agg(DISTINCT %1$I), ''{}'') FROM %2$s WHERE %1$I = ANY ($1)',
      r.columna, r.tabla
    ) || v_excepcion
    INTO v_ref USING v_ids, p_ignorar_torneo;
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

REVOKE ALL ON FUNCTION public.borrar_externos_sin_vinculos(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_externos_sin_vinculos(uuid, uuid[], uuid) TO service_role;

-- Verificación: una sola versión, y solo service_role puede llamarla.
SELECT count(*) AS versiones,
       bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_puede,
       bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_role_puede
FROM pg_proc p
WHERE p.proname = 'borrar_externos_sin_vinculos' AND p.pronamespace = 'public'::regnamespace;

COMMIT;
