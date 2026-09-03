-- ════════════════════════════════════════════════════════════════════════
-- 256 · Observaciones técnicas y objetivos del alumno — solo para el staff
--
-- El formulario de Spinhouse los pide junto con el resto de la ficha:
--
--   "Observaciones técnicas del entrenador y objetivos del alumno
--    (campo libre, visible solo para el staff)."
--
-- ══ Por qué una tabla y no dos columnas en `jugadores` ══════════════════
--
-- Porque **la RLS de Postgres filtra FILAS, no columnas.** La política que le
-- deja a un jugador ver su propia ficha le entrega la fila entera: si estos dos
-- campos vivieran en `jugadores`, cualquier alumno los leería llamando a la API
-- de Supabase con su sesión, sin pasar por ninguna pantalla nuestra. La ficha
-- no los mostraría y el dato igual saldría por la puerta de atrás.
--
-- Es el mismo razonamiento por el que `feedback_profesores` resuelve el
-- anonimato con una función y no con una política (migraciones 228 y 232), y
-- por el que la 254 dejó estos dos campos afuera a propósito en vez de
-- agregarlos con los otros cinco.
--
-- "Con qué mano juega" lo puede ver el propio jugador; "todavía no afirma el
-- codo en el revés y se frustra cuando pierde un punto largo" es una nota del
-- entrenador para el entrenador. Son dos cosas distintas y por eso viven en
-- dos lugares distintos.
--
-- ══ Alcance ════════════════════════════════════════════════════════════
--
-- Crea una tabla vacía y sus políticas. **No escribe una sola fila** y no toca
-- ninguna tabla existente, así que ningún club cambia de comportamiento: uno
-- sin el módulo `perfil_deportivo` no ve el bloque en la ficha y la tabla se
-- queda vacía para siempre.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('256_perfil_tecnico_solo_staff');

-- Es de esquema y no toca filas de nadie, así que se declara a propósito para
-- todos en vez de dejar el portazo sin poner. La tabla nace vacía; que la use
-- solo Spinhouse lo decide el módulo, no esta migración.
SELECT _migracion_para_todos_los_clubes('crea una tabla vacía, no toca filas');


-- ══ 1. La tabla ═════════════════════════════════════════════════════════
--
-- Una fila por jugador: son dos campos de texto que se van reescribiendo, no un
-- historial. Si algún día el club quiere ver cómo cambió la observación en el
-- tiempo, eso es otra tabla y otra conversación — inventarla ahora sería
-- construir un historial que nadie pidió.
CREATE TABLE IF NOT EXISTS public.jugador_perfil_tecnico (
  jugador_id     uuid PRIMARY KEY REFERENCES public.jugadores(id) ON DELETE CASCADE,

  -- Redundante con jugadores.club_id a propósito: la RLS filtra por esta
  -- columna y hacerlo con un JOIN a `jugadores` en cada política es más lento
  -- y más fácil de escribir mal.
  club_id        uuid NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,

  observaciones  text,
  objetivos      text,

  actualizado_en timestamptz NOT NULL DEFAULT now(),

  -- El NOMBRE, no una FK a perfiles. `asistencia.registrado_por` es una FK rota
  -- que dejó inutilizables las tres vías de registro, y `movimientos` ya usa
  -- `registrado_por_nombre` justamente por eso. Un nombre guardado sobrevive a
  -- que la cuenta se borre, que es cuando más importa saber quién escribió.
  actualizado_por_nombre text
);

CREATE INDEX IF NOT EXISTS jugador_perfil_tecnico_club_idx
  ON public.jugador_perfil_tecnico (club_id);

COMMENT ON TABLE public.jugador_perfil_tecnico IS
  'Observaciones del entrenador y objetivos del alumno. SOLO STAFF: está aparte de `jugadores` porque la RLS filtra filas y no columnas, así que en la ficha el propio jugador se llevaría el dato. No agregar acá nada que el jugador sí pueda ver.';


-- ══ 2. Las políticas ════════════════════════════════════════════════════
--
-- Una sola regla, para lectura y escritura: staff del club. El jugador no
-- aparece en ninguna, así que para él la tabla no existe — devuelve 0 filas,
-- no un error.
ALTER TABLE public.jugador_perfil_tecnico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfil_tecnico_staff" ON public.jugador_perfil_tecnico;
CREATE POLICY "perfil_tecnico_staff" ON public.jugador_perfil_tecnico
  FOR ALL
  USING      (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'superadmin', 'profesor'));

-- El superadmin ve todos los clubes, como en el resto del sistema.
DROP POLICY IF EXISTS "perfil_tecnico_superadmin" ON public.jugador_perfil_tecnico;
CREATE POLICY "perfil_tecnico_superadmin" ON public.jugador_perfil_tecnico
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');


-- ══ 3. Realtime ═════════════════════════════════════════════════════════
--
-- Sin esto, una pantalla que se suscriba con `useEnVivo` **no da error**: se
-- conecta, queda escuchando y no llega nada nunca. Mordió dos veces (121 y
-- 142) y la segunda dejó mudas a `movimientos` y `perfiles`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jugador_perfil_tecnico'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_perfil_tecnico;
  END IF;
END;
$$;

COMMIT;


-- ══ Verificación ════════════════════════════════════════════════════════
--
-- 1) La tabla nace vacía. Tiene que dar 0.
-- SELECT count(*) FROM jugador_perfil_tecnico;
--
-- 2) Las dos políticas están, y ninguna menciona al jugador.
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE tablename = 'jugador_perfil_tecnico';
--
-- 3) Está publicada en realtime.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'jugador_perfil_tecnico';
--
-- 4) La prueba de verdad, y hay que hacerla con una cuenta de ALUMNO desde la
--    app: guardar una observación como admin, entrar como el jugador y pedir
--    `select('*').from('jugador_perfil_tecnico')` desde la consola del
--    navegador. Tiene que devolver 0 filas. Si devuelve la fila, la política
--    está mal y el campo "solo staff" es mentira.
