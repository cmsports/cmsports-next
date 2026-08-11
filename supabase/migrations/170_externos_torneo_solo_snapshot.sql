-- Visitantes de torneo externo: nombres viven en el torneo, no como jugadores
-- permanentes. Las fichas `es_externo` se borran al finalizar; estas columnas
-- conservan el historial (podio, partidos, inscritos, pagos).
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;
SELECT _migracion_nueva('170_externos_torneo_solo_snapshot');

-- ══ Snapshots de nombre ═══════════════════════════════════════════════════

ALTER TABLE public.grupo_jugadores
  ADD COLUMN IF NOT EXISTS nombre text;

COMMENT ON COLUMN public.grupo_jugadores.nombre IS
  'Nombre del inscrito en este torneo. Sobrevive al borrar fichas es_externo.';

ALTER TABLE public.torneo_partidos
  ADD COLUMN IF NOT EXISTS nombre_a text,
  ADD COLUMN IF NOT EXISTS nombre_b text,
  ADD COLUMN IF NOT EXISTS nombre_ganador text;

COMMENT ON COLUMN public.torneo_partidos.nombre_a IS
  'Nombre del lado A. Se usa cuando jugador_a queda NULL tras limpiar externos.';

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS campeon_nombre text,
  ADD COLUMN IF NOT EXISTS subcampeon_nombre text;

COMMENT ON COLUMN public.torneos.campeon_nombre IS
  'Nombre del campeón. Permite borrar la ficha es_externo sin perder el podio.';

ALTER TABLE public.torneo_pagos
  ADD COLUMN IF NOT EXISTS jugador_nombre text;

COMMENT ON COLUMN public.torneo_pagos.jugador_nombre IS
  'Nombre del pagador al inscribir. Sobrevive al borrar fichas es_externo.';

-- Backfill suave desde jugadores actuales (no destructivo).
UPDATE public.grupo_jugadores gj
SET nombre = j.nombre
FROM public.jugadores j
WHERE gj.jugador_id = j.id
  AND gj.nombre IS NULL
  AND j.nombre IS NOT NULL;

UPDATE public.torneo_partidos p
SET nombre_a = ja.nombre
FROM public.jugadores ja
WHERE p.jugador_a = ja.id AND p.nombre_a IS NULL;

UPDATE public.torneo_partidos p
SET nombre_b = jb.nombre
FROM public.jugadores jb
WHERE p.jugador_b = jb.id AND p.nombre_b IS NULL;

UPDATE public.torneo_partidos p
SET nombre_ganador = jg.nombre
FROM public.jugadores jg
WHERE p.ganador = jg.id AND p.nombre_ganador IS NULL;

UPDATE public.torneos t
SET campeon_nombre = j.nombre
FROM public.jugadores j
WHERE t.campeon_id = j.id AND t.campeon_nombre IS NULL;

UPDATE public.torneos t
SET subcampeon_nombre = j.nombre
FROM public.jugadores j
WHERE t.subcampeon_id = j.id AND t.subcampeon_nombre IS NULL;

UPDATE public.torneo_pagos tp
SET jugador_nombre = j.nombre
FROM public.jugadores j
WHERE tp.jugador_id = j.id AND tp.jugador_nombre IS NULL;

-- ══ Vista pública: prioriza snapshot si el jugador ya no está ══════════════

CREATE OR REPLACE FUNCTION public.torneo_publico(p_codigo text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT json_build_object(
    'torneo', json_build_object(
      'id', t.id, 'nombre', t.nombre, 'fase', t.fase, 'estado', t.estado,
      'campeon_nombre', t.campeon_nombre, 'subcampeon_nombre', t.subcampeon_nombre
    ),
    'grupos', COALESCE((
      SELECT json_agg(json_build_object('id', g.id, 'nombre', g.nombre) ORDER BY g.nombre)
      FROM torneo_grupos g
      WHERE g.torneo_id = t.id AND g.nombre <> 'MESA'
    ), '[]'::json),
    'jugadores', COALESCE((
      SELECT json_agg(json_build_object(
        'id', COALESCE(j.id, gj.id),
        'nombre', COALESCE(gj.nombre, j.nombre),
        'grupo_id', gj.grupo_id
      ))
      FROM grupo_jugadores gj
      JOIN torneo_grupos g ON g.id = gj.grupo_id
      LEFT JOIN jugadores j ON j.id = gj.jugador_id
      WHERE g.torneo_id = t.id
        AND COALESCE(gj.nombre, j.nombre) IS NOT NULL
    ), '[]'::json),
    'partidos', COALESCE((
      SELECT json_agg(json_build_object(
        'id', p.id, 'fase', p.fase, 'grupo_id', p.grupo_id, 'orden', p.orden,
        'jugador_a', p.jugador_a, 'jugador_b', p.jugador_b, 'ganador', p.ganador,
        'nombre_a', COALESCE(p.nombre_a, ja.nombre),
        'nombre_b', COALESCE(p.nombre_b, jb.nombre)
      ) ORDER BY p.fase, p.orden)
      FROM torneo_partidos p
      LEFT JOIN jugadores ja ON ja.id = p.jugador_a
      LEFT JOIN jugadores jb ON jb.id = p.jugador_b
      WHERE p.torneo_id = t.id
    ), '[]'::json)
  )
  FROM torneos t
  WHERE t.codigo = upper(p_codigo)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.torneo_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.torneo_publico(text) TO anon, authenticated;

COMMIT;
