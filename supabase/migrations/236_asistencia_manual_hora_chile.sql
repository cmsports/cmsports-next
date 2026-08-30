-- ────────────────────────────────────────────────────────────
-- `registrar_asistencia_manual` guarda la hora del servidor (UTC), no la de
-- Chile. Es la única de las tres vías de asistencia que lo hace mal.
--
-- ── El defecto ────────────────────────────────────────────────────────────
--     INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, metodo)
--     VALUES (v_club, p_jugador_id, p_fecha, localtime, p_estado, 'manual');
--                                             ^^^^^^^^^
--
-- `localtime` es la hora local del SERVIDOR, que en Supabase es UTC. Sus dos
-- hermanas lo hacen bien desde siempre:
--
--   registrar_asistencia_segura (105)  → (now() AT TIME ZONE 'America/Santiago')::time
--   registrar_asistencia_rut    (042)  → (now() AT TIME ZONE 'America/Santiago')::time
--
-- ── Por qué se escapó de las dos pasadas de zona horaria ──────────────────
-- La 116 y la 137 barrieron `current_date` en las funciones de plata y de
-- vigencia. Ninguna de las dos miraba `asistencia.hora`, así que este quedó.
--
-- ── Alcance del daño ──────────────────────────────────────────────────────
-- Acotado, y conviene decirlo con precisión: la FECHA llega como parámetro
-- desde la aplicación (que ya usa `fechaChile()`), así que **los porcentajes
-- de asistencia y las sesiones consumidas están bien**. Lo que queda mal es
-- la columna `hora` de las asistencias corregidas a mano: 3 o 4 horas
-- adelantada según la época del año.
--
-- No se corrigen las filas viejas. La hora de una asistencia corregida a mano
-- no es un dato que el sistema use para calcular nada —solo se muestra— y
-- reescribir un timestamp histórico inventando cuál era el offset de ese día
-- es peor que dejarlo. Desde acá en adelante queda bien.
--
-- No borra ni modifica ninguna fila.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('236_asistencia_manual_hora_chile');

-- Cuerpo idéntico al de la 092 salvo `localtime`. `SET search_path` va
-- declarado: CREATE OR REPLACE borra el que le puso la 210.
CREATE OR REPLACE FUNCTION public.registrar_asistencia_manual(
  p_jugador_id uuid,
  p_fecha      date,
  p_estado     text,
  p_motivo     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club     uuid;
  v_rol      text;
  v_anterior text;
  v_hora     time := (now() AT TIME ZONE 'America/Santiago')::time;
BEGIN
  SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();

  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'superadmin', 'profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden corregir la asistencia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jugadores WHERE id = p_jugador_id AND club_id = v_club) THEN
    RAISE EXCEPTION 'El jugador no es de este club';
  END IF;

  IF p_estado NOT IN ('presente', 'ausente', 'sin_registro') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  SELECT estado INTO v_anterior FROM asistencia
  WHERE jugador_id = p_jugador_id AND fecha = p_fecha;

  IF p_estado = 'sin_registro' THEN
    DELETE FROM asistencia WHERE jugador_id = p_jugador_id AND fecha = p_fecha;
  ELSE
    INSERT INTO asistencia (club_id, jugador_id, fecha, hora, estado, metodo)
    VALUES (v_club, p_jugador_id, p_fecha, v_hora, p_estado, 'manual')
    ON CONFLICT (jugador_id, fecha) DO UPDATE SET estado = EXCLUDED.estado;
  END IF;

  IF v_anterior IS DISTINCT FROM NULLIF(p_estado, 'sin_registro') THEN
    INSERT INTO auditoria_asistencia
      (club_id, jugador_id, fecha, estado_anterior, estado_nuevo, motivo, usuario_id)
    VALUES
      (v_club, p_jugador_id, p_fecha, v_anterior, NULLIF(p_estado, 'sin_registro'), p_motivo, auth.uid());
  END IF;

  PERFORM public.recalcular_sesiones(p_jugador_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_asistencia_manual(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_manual(uuid, date, text, text) TO authenticated;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT ────────────────────────

-- 1) Ya no usa localtime y sí la zona de Chile: false, true.
SELECT pg_get_functiondef(p.oid) ~ '\mlocaltime\M'      AS aun_usa_localtime,
       pg_get_functiondef(p.oid) LIKE '%America/Santiago%' AS usa_hora_chile
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'registrar_asistencia_manual';

-- 2) Y conserva su search_path fijo (lo que la 210 tuvo que reponer): true.
SELECT EXISTS (
  SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
) AS tiene_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'registrar_asistencia_manual';
