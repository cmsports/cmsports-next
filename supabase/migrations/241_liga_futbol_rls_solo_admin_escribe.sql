-- ────────────────────────────────────────────────────────────
-- Liga de fútbol: escribir queda solo para el admin, no para cualquiera del club.
--
-- Este cambio es de esquema (afecta a cualquier club que use el módulo de
-- liga de fútbol, hoy ninguno en producción salvo pruebas).
--
-- ── EL AGUJERO ─────────────────────────────────────────────────────────────
-- La migración 221 le dio a las nueve tablas `lf_*` una sola política por
-- tabla, `FOR ALL USING (club_id IN (... del club de quien pregunta ...))`,
-- sin mirar el rol. En Postgres, una política `FOR ALL` con un solo `USING`
-- y sin `WITH CHECK` aparte usa la MISMA condición para leer, insertar,
-- actualizar y borrar. Resultado: cualquier perfil del club —un jugador,
-- no solo el admin— podía crear, editar o borrar ligas, equipos, partidos,
-- goles y tarjetas llamando directo a la API de Supabase con su propia
-- sesión, sin pasar por `src/app/actions/liga-futbol.ts` ni por
-- `requireAdminClub()`.
--
-- Las funciones del servidor SÍ exigían admin — el agujero estaba solo en la
-- base, para quien la llamara directo. Es la misma clase de bug que ya se
-- corrigió en las auditorías anteriores: la comprobación vivía en un solo
-- lado (la pantalla / el server action) y no en los dos.
--
-- ── EL PATRÓN CORRECTO YA EXISTE EN EL REPO ────────────────────────────────
-- `liga_partidos` (la liga de tenis de mesa, migración 013) separa las dos
-- cosas desde el principio: una política de SELECT abierta a todo el club, y
-- una de `FOR ALL` que además exige `get_my_rol() = 'admin'`. Esta migración
-- le da esa misma forma a las nueve tablas de liga de fútbol.
--
-- No cambia qué puede LEER cada uno (las políticas de SELECT y las públicas
-- de la 221 quedan iguales) — solo separa la lectura de la escritura y le
-- pone el mismo guardia de rol que ya tiene el resto del sistema.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('241_liga_futbol_rls_solo_admin_escribe');

-- ── lf_ligas ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_ligas_club" ON lf_ligas;
CREATE POLICY "lf_ligas_select" ON lf_ligas
  FOR SELECT USING (club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()));
CREATE POLICY "lf_ligas_admin_all" ON lf_ligas
  FOR ALL
  USING      (get_my_rol() = 'admin' AND club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  WITH CHECK (get_my_rol() = 'admin' AND club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()));

-- ── lf_grupos ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_grupos_club" ON lf_grupos;
CREATE POLICY "lf_grupos_select" ON lf_grupos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );
CREATE POLICY "lf_grupos_admin_all" ON lf_grupos
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

-- ── lf_equipos ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_equipos_club" ON lf_equipos;
CREATE POLICY "lf_equipos_select" ON lf_equipos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );
CREATE POLICY "lf_equipos_admin_all" ON lf_equipos
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

-- ── lf_jugadores ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_jugadores_club" ON lf_jugadores;
CREATE POLICY "lf_jugadores_select" ON lf_jugadores
  FOR SELECT USING (
    equipo_id IN (SELECT id FROM lf_equipos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );
CREATE POLICY "lf_jugadores_admin_all" ON lf_jugadores
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND equipo_id IN (SELECT id FROM lf_equipos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND equipo_id IN (SELECT id FROM lf_equipos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

-- ── lf_fechas ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_fechas_club" ON lf_fechas;
CREATE POLICY "lf_fechas_select" ON lf_fechas
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );
CREATE POLICY "lf_fechas_admin_all" ON lf_fechas
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

-- ── lf_partidos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_partidos_club" ON lf_partidos;
CREATE POLICY "lf_partidos_select" ON lf_partidos
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );
CREATE POLICY "lf_partidos_admin_all" ON lf_partidos
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

-- ── lf_goles ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_goles_club" ON lf_goles;
CREATE POLICY "lf_goles_select" ON lf_goles
  FOR SELECT USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );
CREATE POLICY "lf_goles_admin_all" ON lf_goles
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

-- ── lf_tarjetas ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_tarjetas_club" ON lf_tarjetas;
CREATE POLICY "lf_tarjetas_select" ON lf_tarjetas
  FOR SELECT USING (
    partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );
CREATE POLICY "lf_tarjetas_admin_all" ON lf_tarjetas
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND partido_id IN (SELECT id FROM lf_partidos WHERE liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid())))
  );

-- ── lf_sanciones ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lf_sanciones_club" ON lf_sanciones;
CREATE POLICY "lf_sanciones_select" ON lf_sanciones
  FOR SELECT USING (
    liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );
CREATE POLICY "lf_sanciones_admin_all" ON lf_sanciones
  FOR ALL
  USING (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND liga_id IN (SELECT id FROM lf_ligas WHERE club_id IN (SELECT club_id FROM perfiles WHERE id = auth.uid()))
  );

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Cada tabla tiene que quedar con dos políticas de club (select + admin_all),
-- más las 8 públicas de la 221 que no se tocaron:
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename LIKE 'lf_%' ORDER BY tablename, policyname;
--
-- Simulando la sesión de un jugador (reemplazar el UUID por uno de perfiles
-- con rol 'jugador'), esto tiene que fallar por RLS, no insertar nada:
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"UUID-DE-UN-JUGADOR"}';
-- INSERT INTO lf_ligas (club_id, nombre) VALUES ('CLUB-ID-DEL-JUGADOR', 'liga colada');
-- ROLLBACK;
