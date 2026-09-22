-- 281 — El profesor puede dirigir los torneos del club, donde el club lo diga.
--
-- Spinhouse trabaja con un profesor que corre los torneos internos y externos
-- de punta a punta. Hasta hoy el RLS solo dejaba escribir al admin: la única
-- excepción era "torneos_profesor_insert" (migración 034), que permitía CREAR
-- el torneo y nada más — ni armar los grupos, ni cargar un resultado, ni
-- inscribir a nadie. Media puerta.
--
-- La diferencia entre clubes va como dato, no como código: la clave
-- `profe.gestiona_torneos` en `club_config`, con default 'no'. Un club sin la
-- fila se comporta exactamente como antes de esta migración, que es por qué
-- esto puede entrar sin tocar a Buin.
--
-- Las políticas nuevas son ADITIVAS: no se toca ninguna de las
-- "*_admin_all" existentes. RLS evalúa las permisivas con OR, así que el
-- admin sigue pasando por la suya de siempre y el peor caso de un error acá
-- es que el profesor no pase — no que el admin deje de pasar.
--
-- Lo que NO se abre, a propósito: los premios, los gastos de gestión y el
-- "subir a Finanzas" son plata del club y siguen siendo del admin (eso se
-- decide en las Server Actions, `torneos.ts`); `torneo_cabezas_serie` no
-- tiene política de escritura para nadie porque se llena por RPC.

BEGIN;

SELECT _migracion_nueva('281_profesor_gestiona_torneos');
SELECT _migracion_para_todos_los_clubes(
  'crea políticas y una función; no inserta ni borra ninguna fila'
);

-- SECURITY DEFINER porque el profesor no necesariamente puede leer
-- `club_config` por su propio RLS, y si la lectura devuelve vacío la función
-- diría "no" por el motivo equivocado. STABLE para que Postgres la evalúe una
-- vez por consulta y no una vez por fila.
CREATE OR REPLACE FUNCTION public.puede_gestionar_torneos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_rol() = 'profesor'
     AND EXISTS (
       SELECT 1 FROM public.club_config c
       WHERE c.club_id = public.get_my_club_id()
         AND c.clave = 'profe.gestiona_torneos'
         AND c.valor = '"si"'::jsonb
     )
$$;

COMMENT ON FUNCTION public.puede_gestionar_torneos() IS
  'true si quien llama es profesor de un club con profe.gestiona_torneos = si. '
  'No incluye al admin: las políticas admin_all ya lo cubren y se evalúan con OR.';

REVOKE ALL ON FUNCTION public.puede_gestionar_torneos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_torneos() TO authenticated;


-- torneos — el INSERT suelto de la 034 queda absorbido por esta, que además
-- cubre update y delete. Se borra para no dejar dos reglas diciendo lo mismo
-- con criterios distintos (la vieja no miraba la configuración del club).
DROP POLICY IF EXISTS "torneos_profesor_insert" ON public.torneos;
DROP POLICY IF EXISTS "torneos_profe_torneos" ON public.torneos;
CREATE POLICY "torneos_profe_torneos" ON public.torneos
  FOR ALL TO authenticated
  USING (club_id = get_my_club_id() AND puede_gestionar_torneos())
  WITH CHECK (club_id = get_my_club_id() AND puede_gestionar_torneos());


-- torneo_grupos / torneo_jugadores / torneo_partidos / torneo_pagos:
-- todas cuelgan del torneo por `torneo_id`, así que la condición es la misma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['torneo_grupos', 'torneo_jugadores', 'torneo_partidos', 'torneo_pagos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_profe_torneos', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
          AND puede_gestionar_torneos()
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
          AND puede_gestionar_torneos()
        )
    $f$, t || '_profe_torneos', t);
  END LOOP;
END $$;


-- grupo_jugadores es la única que llega al torneo por dos saltos.
DROP POLICY IF EXISTS "grupo_jugadores_profe_torneos" ON public.grupo_jugadores;
CREATE POLICY "grupo_jugadores_profe_torneos" ON public.grupo_jugadores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.torneo_grupos tg
      JOIN public.torneos t ON t.id = tg.torneo_id
      WHERE tg.id = grupo_id AND t.club_id = get_my_club_id()
    )
    AND puede_gestionar_torneos()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torneo_grupos tg
      JOIN public.torneos t ON t.id = tg.torneo_id
      WHERE tg.id = grupo_id AND t.club_id = get_my_club_id()
    )
    AND puede_gestionar_torneos()
  );

COMMIT;


-- ── Para encender la llave en Spinhouse ─────────────────────────────────
-- Va aparte porque escribe una fila de UN club y esta migración es de
-- esquema para todos. Se puede correr desde la pantalla de Configuración o
-- pegando esto:
--
--   insert into club_config (club_id, clave, valor)
--   values ('2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41', 'profe.gestiona_torneos', '"si"'::jsonb)
--   on conflict (club_id, clave) do update set valor = excluded.valor;
