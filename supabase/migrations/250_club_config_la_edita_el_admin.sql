-- ────────────────────────────────────────────────────────────
-- El admin edita la configuración de su propio club.
--
-- Este cambio afecta a: TODOS los clubes. Cambia dos políticas RLS y no toca
-- ni una fila.
--
-- ══ Qué corrige ═══════════════════════════════════════════════════════════
--
-- La migración 248 dejó `club_config` con escritura **solo para superadmin**,
-- con el argumento de que hay claves que mueven plata y otras que bloquean
-- personas, y que empezar cerrado es reversible.
--
-- Ese argumento estaba mal aplicado. Casi todo lo que hay en esa tabla son
-- decisiones del club sobre su propio club: cuántos jugadores entran por mesa,
-- a los cuántos días avisar de una deuda, cuánto vale ganar un partido. Que el
-- admin tenga que pedirlas por WhatsApp es exactamente la fricción que este
-- sistema existe para sacar.
--
-- ══ El criterio, que no es "delicado" ═════════════════════════════════════
--
-- El superadmin no se queda con las claves GRAVES: se queda con las que tienen
-- una **precondición técnica**, o sea aquellas cuya seguridad depende de código
-- que puede no existir todavía.
--
--   · `mensualidad.modo`         — pasar a planes sin planes cargados deja al
--                                  club sin poder emitir una sola cuota.
--   · `inscripcion.autoservicio` — encenderlo sin la función atómica de
--                                  inscripción hace que dos alumnos tomen el
--                                  mismo último cupo.
--
-- Bloquear morosos ES grave, y aun así es del admin: que una decisión sea
-- grave no la vuelve del superadmin, la vuelve algo que la PANTALLA tiene que
-- explicar bien antes de que el admin apriete. Un permiso no es el lugar donde
-- se pide pensar.
--
-- ══ Las dos listas ════════════════════════════════════════════════════════
--
-- La de abajo tiene que decir lo mismo que `editablePor: 'superadmin'` en
-- `src/lib/domain/clubConfig.ts`. Son dos lenguajes distintos y no hay forma de
-- derivar una de la otra, así que `clubConfig.test.ts` las cruza leyendo este
-- archivo y falla si se separan — el mismo patrón que `rutas-protegidas`.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('250_club_config_la_edita_el_admin');
SELECT _migracion_para_todos_los_clubes(
  'cambia dos políticas RLS de club_config; no escribe ninguna fila');


-- ══ Las claves reservadas al superadmin ═══════════════════════════════════
-- ⚠ Esta lista tiene que coincidir con `editablePor: 'superadmin'` del
--   catálogo de TypeScript. La prueba las cruza.
CREATE OR REPLACE FUNCTION public._club_config_es_de_superadmin(p_clave text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_clave IN (
    'mensualidad.modo',
    'inscripcion.autoservicio'
  );
$$;

COMMENT ON FUNCTION public._club_config_es_de_superadmin(text) IS
  'Claves de club_config cuya edición exige superadmin, por tener una precondición técnica. Espejo de editablePor en src/lib/domain/clubConfig.ts; clubConfig.test.ts cruza las dos listas.';


-- ══ La escritura, ahora por clave ═════════════════════════════════════════
--
-- La 248 tenía una sola política `FOR ALL` de superadmin. Se reemplaza por
-- dos, que es lo que permite que el rol dependa de la fila:
--
--   · el superadmin escribe cualquier clave, de cualquier club;
--   · el admin escribe las de SU club que no estén reservadas.
--
-- `WITH CHECK` además de `USING` en las dos, y no es redundante: `USING`
-- decide qué filas puede tocar, `WITH CHECK` qué filas puede dejar escritas.
-- Sin el segundo, un admin podría tomar una fila suya que sí puede editar y
-- hacerle UPDATE cambiándole la clave a una reservada.
DROP POLICY IF EXISTS "club_config_escritura" ON public.club_config;

DROP POLICY IF EXISTS "club_config_escritura_superadmin" ON public.club_config;
CREATE POLICY "club_config_escritura_superadmin" ON public.club_config
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');

DROP POLICY IF EXISTS "club_config_escritura_admin" ON public.club_config;
CREATE POLICY "club_config_escritura_admin" ON public.club_config
  FOR ALL
  USING (
    club_id = get_my_club_id()
    AND get_my_rol() = 'admin'
    AND NOT _club_config_es_de_superadmin(clave)
  )
  WITH CHECK (
    club_id = get_my_club_id()
    AND get_my_rol() = 'admin'
    AND NOT _club_config_es_de_superadmin(clave)
  );

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Quedaron tres políticas: una de lectura y dos de escritura.
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'club_config' ORDER BY policyname;

-- 2) La función responde lo que tiene que responder.
-- SELECT
--   _club_config_es_de_superadmin('mensualidad.modo')         AS reservada_ok,
--   _club_config_es_de_superadmin('inscripcion.autoservicio') AS reservada_ok2,
--   _club_config_es_de_superadmin('cupos.por_mesa_grupal')    AS del_admin,
--   _club_config_es_de_superadmin('morosidad.dias_bloqueo')   AS del_admin2;
-- Tiene que dar: true, true, false, false.

-- 3) La tabla sigue vacía: esto no escribió nada.
-- SELECT count(*) AS filas FROM club_config;
