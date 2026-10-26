# Cambios de grupos atómicos

Por qué existe este documento: el 2026-10-25, en TC A y TC B, mover un jugador de
grupo dejó partidos contra quien ya no estaba en el grupo ("vs —") y grupos sin los
partidos del jugador que llegó. La acción respondió éxito.

## Qué se hizo (rama `fix/torneos-consistencia`)

Detección y guardas. No cambia cómo se escribe, cambia que ya no se puede fallar en silencio.

- `src/lib/domain/torneoConsistencia.ts`: la regla que no se puede romper. Todo partido
  de un grupo es entre dos integrantes de ese grupo, y todo par de integrantes tiene su
  partido (una vez por rueda).
- `verificarTorneo` (acción de solo lectura) y `AvisoConsistencia` (aviso arriba de la
  ficha del torneo). Se verifica al abrir y cada vez que cambian los partidos.
- Las lecturas que habilitan una guarda ahora cortan si fallan. Antes la guarda quedaba
  en `null`, no saltaba, y se borraban resultados ya jugados: mover, reordenar y quitar
  jugador, limpiar grupos huérfanos, sincronizar llaves y grupos tardíos.
- `cerrarInscripcionYGenerarGrupos` se niega a borrar un torneo con resultados cargados.
  El reinicio del cuadro en eliminación directa (`volverAGrupos`) lo pide con `reiniciar: true`.
- Las pruebas comprueban el estado final de las tablas, no el mensaje de la acción.

## Lo que sigue sin resolverse y por qué

Supabase desde la Server Action no tiene transacciones. Mover un jugador son unas seis
escrituras seguidas, con un `restaurarMovimiento` a mano por si falla alguna. Cada vez que
se agrega un paso, se agrega un lugar donde el torneo puede quedar a medias. Las guardas de
arriba cierran los casos conocidos; no cierran los que todavía no conocemos.

## Propuesta: una sola función de base de datos que valida y aplica

La acción ya arma todo en memoria (integrantes de después y partidos nuevos). En vez de
escribirlo en pasos, lo manda a una función que **valida la regla y aplica todo o nada**.
Si el reparto que le llega rompe la regla, la función revienta y la base queda como estaba:
el estado de ayer deja de ser posible de escribir.

- `SECURITY INVOKER`: corre con los permisos de quien llama, así que el RLS de hoy sigue
  mandando y no se abre ningún permiso nuevo.
- Compara las filas que dijo tocar con las que de verdad tocó, para que un RLS que filtra
  sin dar error (0 filas) también reviente en vez de pasar.
- Orden de adopción, de a una, probando cada una antes de pasar a la siguiente: mover
  jugador, quitar jugador, reordenar, grupos tardíos, cerrar inscripción.

### Borrador del SQL (SIN PROBAR, NO PEGAR TODAVÍA)

Antes de pegarlo: probarlo en **Demostración TDM**, numerarlo mirando
`_migraciones_aplicadas` y no `ls` del repo (el repo va detrás de la base), y declarar el
club. Es una función nueva que no toca filas, así que va como "para todos los clubes".

```sql
BEGIN;
SELECT _migracion_nueva('NNN_cambio_de_grupos_atomico');
SELECT _migracion_para_todos_los_clubes('crea una función nueva; no toca ninguna fila al aplicarse');

CREATE OR REPLACE FUNCTION public.aplicar_cambio_de_grupos_atomico(
  p_torneo_id       uuid,
  p_grupos          uuid[],   -- grupos cuyo reparto se reemplaza
  p_miembros        jsonb,    -- [{id, grupo_id, orden}] reparto FINAL de todos los integrantes de esos grupos
  p_partidos        jsonb,    -- [{grupo_id, jugador_a, jugador_b, orden}] partidos FINALES de esos grupos
  p_grupos_a_borrar uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_club uuid; v_estado text; v_ruedas int; v_n int;
BEGIN
  SELECT club_id, estado, COALESCE(ruedas, 1) INTO v_club, v_estado, v_ruedas
    FROM torneos WHERE id = p_torneo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Torneo no encontrado'; END IF;
  IF v_estado IN ('finalizado', 'archivado', 'cancelado') THEN
    RAISE EXCEPTION 'El torneo está %: no se pueden cambiar sus grupos', v_estado;
  END IF;

  SELECT count(*) INTO v_n FROM torneo_grupos WHERE torneo_id = p_torneo_id AND id = ANY(p_grupos);
  IF v_n <> cardinality(p_grupos) THEN RAISE EXCEPTION 'Algún grupo no pertenece al torneo'; END IF;
  IF NOT (p_grupos_a_borrar <@ p_grupos) THEN RAISE EXCEPTION 'Solo se pueden borrar grupos que se están cambiando'; END IF;

  PERFORM 1 FROM torneo_partidos
   WHERE torneo_id = p_torneo_id AND grupo_id = ANY(p_grupos) AND ganador IS NOT NULL;
  IF FOUND THEN RAISE EXCEPTION 'Alguno de los grupos ya tiene partidos jugados'; END IF;

  -- Todos los integrantes actuales de esos grupos tienen que venir en el reparto final.
  IF EXISTS (
    SELECT 1 FROM grupo_jugadores gj
     WHERE gj.grupo_id = ANY(p_grupos)
       AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_miembros) m(id uuid, grupo_id uuid, orden int) WHERE m.id = gj.id)
  ) THEN RAISE EXCEPTION 'Falta algún integrante en el reparto final'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_miembros) m(id uuid, grupo_id uuid, orden int)
     WHERE NOT (m.grupo_id = ANY(p_grupos))
  ) THEN RAISE EXCEPTION 'Un integrante apunta a un grupo que no se está cambiando'; END IF;

  -- Aplicar. Se compara lo que se dijo tocar con lo que de verdad se tocó.
  UPDATE grupo_jugadores gj SET grupo_id = m.grupo_id, orden = m.orden
    FROM jsonb_to_recordset(p_miembros) m(id uuid, grupo_id uuid, orden int)
   WHERE gj.id = m.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> jsonb_array_length(p_miembros) THEN
    RAISE EXCEPTION 'Se esperaba mover % integrantes y se movieron %', jsonb_array_length(p_miembros), v_n;
  END IF;

  -- LA REGLA: cada partido es entre dos integrantes de su grupo, ya con el reparto aplicado.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_partidos) p(grupo_id uuid, jugador_a uuid, jugador_b uuid, orden int)
     WHERE NOT EXISTS (SELECT 1 FROM grupo_jugadores g WHERE g.grupo_id = p.grupo_id AND g.jugador_id = p.jugador_a)
        OR NOT EXISTS (SELECT 1 FROM grupo_jugadores g WHERE g.grupo_id = p.grupo_id AND g.jugador_id = p.jugador_b)
  ) THEN RAISE EXCEPTION 'Un partido incluye a alguien que no está en su grupo'; END IF;

  -- Y cada grupo que se juega tiene todos sus partidos: n(n-1)/2 por rueda.
  IF EXISTS (
    SELECT 1 FROM torneo_grupos g
     WHERE g.id = ANY(p_grupos) AND NOT (g.id = ANY(p_grupos_a_borrar))
       AND g.nombre <> 'MESA' AND NOT COALESCE(g.en_preparacion, false)
       AND (SELECT count(*) FROM jsonb_to_recordset(p_partidos) p(grupo_id uuid, jugador_a uuid, jugador_b uuid, orden int)
             WHERE p.grupo_id = g.id)
        <> (SELECT (count(*) * (count(*) - 1) / 2) * v_ruedas FROM grupo_jugadores gj WHERE gj.grupo_id = g.id)
  ) THEN RAISE EXCEPTION 'La cantidad de partidos de un grupo no corresponde a sus integrantes'; END IF;

  DELETE FROM torneo_partidos WHERE torneo_id = p_torneo_id AND grupo_id = ANY(p_grupos);

  INSERT INTO torneo_partidos (torneo_id, grupo_id, fase, jugador_a, jugador_b, orden)
  SELECT p_torneo_id, p.grupo_id, 'grupos', p.jugador_a, p.jugador_b, p.orden
    FROM jsonb_to_recordset(p_partidos) p(grupo_id uuid, jugador_a uuid, jugador_b uuid, orden int);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> jsonb_array_length(p_partidos) THEN
    RAISE EXCEPTION 'Se esperaba crear % partidos y se crearon %', jsonb_array_length(p_partidos), v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM grupo_jugadores WHERE grupo_id = ANY(p_grupos_a_borrar)) THEN
    RAISE EXCEPTION 'Un grupo que se iba a borrar todavía tiene integrantes';
  END IF;
  DELETE FROM torneo_grupos WHERE torneo_id = p_torneo_id AND id = ANY(p_grupos_a_borrar);

  INSERT INTO audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club, 'torneos', p_torneo_id, 'cambio_de_grupos',
          jsonb_build_object('grupos', p_grupos, 'integrantes', jsonb_array_length(p_miembros),
                             'partidos', jsonb_array_length(p_partidos), 'grupos_borrados', cardinality(p_grupos_a_borrar)),
          auth.uid());

  RETURN jsonb_build_object('integrantes', jsonb_array_length(p_miembros), 'partidos', jsonb_array_length(p_partidos));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aplicar_cambio_de_grupos_atomico(uuid, uuid[], jsonb, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aplicar_cambio_de_grupos_atomico(uuid, uuid[], jsonb, jsonb, uuid[]) TO authenticated;
COMMIT;
```

### Cómo se prueba antes de usarla en un torneo real

1. En **Demostración TDM**, un torneo de 8 jugadores con dos grupos de 4.
2. Mover un jugador de A a B. Mirar el aviso de consistencia: tiene que decir "verificados".
3. Probar a propósito los casos que deben reventar: un grupo con un resultado cargado; un
   reparto al que le falta un integrante; un partido con un jugador de otro grupo. En los
   tres, la base tiene que quedar idéntica a antes.
4. Recién ahí cambiar `moverJugadorEntreGrupos` para que llame a la función, con las
   pruebas del estado final que ya existen.

## Cómo trabajamos mientras tanto

- No subir arreglos con un torneo en juego si no traen una prueba que reproduzca el caso.
  El 2026-10-25 el mismo arreglo salió dos veces con cinco minutos de diferencia.
- Antes de cada torneo, ensayar en Demostración los movimientos que se van a necesitar.
- Si el aviso rojo aparece durante un torneo, no cargar más resultados en esos grupos y
  avisar a soporte con la pantalla a la vista.
