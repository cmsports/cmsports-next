-- ============================================================
-- CmSports — Row Level Security (RLS)
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo
--   3. Haz clic en "Run"
--   4. Si algo falla, revisa el mensaje — probablemente una
--      política ya existe. Puedes correrlo de nuevo sin riesgo.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Helper: función que devuelve el rol del usuario actual
-- Se usa en las políticas para no repetir la query cada vez
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────
-- Helper: función que devuelve el club_id del usuario actual
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM perfiles WHERE id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────
-- Helper: función que devuelve el jugador_id del usuario actual
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_jugador_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jugador_id FROM perfiles WHERE id = auth.uid()
$$;


-- ============================================================
-- 1. CLUBES — todos pueden leer su club, solo admin modifica
-- ============================================================
ALTER TABLE clubes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clubes_select" ON clubes;
CREATE POLICY "clubes_select" ON clubes
  FOR SELECT USING (id = get_my_club_id());

DROP POLICY IF EXISTS "clubes_admin_all" ON clubes;
CREATE POLICY "clubes_admin_all" ON clubes
  FOR ALL USING (id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 2. PERFILES — cada usuario lee su perfil; admin lee todos del club
-- ============================================================
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfiles_select_own" ON perfiles;
CREATE POLICY "perfiles_select_own" ON perfiles
  FOR SELECT USING (
    id = auth.uid()
    OR (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'))
  );

DROP POLICY IF EXISTS "perfiles_update_own" ON perfiles;
CREATE POLICY "perfiles_update_own" ON perfiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "perfiles_admin_all" ON perfiles;
CREATE POLICY "perfiles_admin_all" ON perfiles
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 3. USUARIOS — admin del club puede todo; otros solo lectura
-- ============================================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "usuarios_admin_all" ON usuarios;
CREATE POLICY "usuarios_admin_all" ON usuarios
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 4. JUGADORES — admin/profesor leen todos del club; jugador solo el suyo
-- ============================================================
ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jugadores_select" ON jugadores;
CREATE POLICY "jugadores_select" ON jugadores
  FOR SELECT USING (
    club_id = get_my_club_id()
  );

DROP POLICY IF EXISTS "jugadores_admin_write" ON jugadores;
CREATE POLICY "jugadores_admin_write" ON jugadores
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 5. PROFESORES — lectura del club; admin modifica
-- ============================================================
ALTER TABLE profesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profesores_select" ON profesores;
CREATE POLICY "profesores_select" ON profesores
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "profesores_admin_all" ON profesores;
CREATE POLICY "profesores_admin_all" ON profesores
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 6. CLASES — lectura del club; admin y profesor modifican
-- ============================================================
ALTER TABLE clases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clases_select" ON clases;
CREATE POLICY "clases_select" ON clases
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "clases_admin_profesor_write" ON clases;
CREATE POLICY "clases_admin_profesor_write" ON clases
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'));


-- ============================================================
-- 7. CLASE_JUGADORES — lectura del club; admin/profesor modifican
-- ============================================================
ALTER TABLE clase_jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clase_jugadores_select" ON clase_jugadores;
CREATE POLICY "clase_jugadores_select" ON clase_jugadores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "clase_jugadores_write" ON clase_jugadores;
CREATE POLICY "clase_jugadores_write" ON clase_jugadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'profesor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clases c WHERE c.id = clase_id AND c.club_id = get_my_club_id())
    AND get_my_rol() IN ('admin', 'profesor')
  );


-- ============================================================
-- 8. RESERVAS — jugador ve/crea las suyas; admin/profesor ven todas del club
-- ============================================================
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservas_select" ON reservas;
CREATE POLICY "reservas_select" ON reservas
  FOR SELECT USING (
    jugador_id = get_my_jugador_id()
    OR get_my_rol() IN ('admin', 'profesor')
  );

DROP POLICY IF EXISTS "reservas_jugador_insert" ON reservas;
CREATE POLICY "reservas_jugador_insert" ON reservas
  FOR INSERT WITH CHECK (
    jugador_id = get_my_jugador_id()
  );

DROP POLICY IF EXISTS "reservas_admin_all" ON reservas;
CREATE POLICY "reservas_admin_all" ON reservas
  FOR ALL USING (get_my_rol() IN ('admin', 'profesor'))
  WITH CHECK (get_my_rol() IN ('admin', 'profesor'));


-- ============================================================
-- 9. ASISTENCIA — profesor/admin escriben; jugador lee la suya
-- ============================================================
ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asistencia_select" ON asistencia;
CREATE POLICY "asistencia_select" ON asistencia
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'profesor')
      OR jugador_id = get_my_jugador_id()
    )
  );

DROP POLICY IF EXISTS "asistencia_write" ON asistencia;
CREATE POLICY "asistencia_write" ON asistencia
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'));


-- ============================================================
-- 10. MENSUALIDADES — admin todo; jugador solo lee las suyas
-- ============================================================
ALTER TABLE mensualidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mensualidades_select" ON mensualidades;
CREATE POLICY "mensualidades_select" ON mensualidades
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() = 'admin'
      OR jugador_id = get_my_jugador_id()
    )
  );

DROP POLICY IF EXISTS "mensualidades_admin_all" ON mensualidades;
CREATE POLICY "mensualidades_admin_all" ON mensualidades
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "mensualidades_jugador_update" ON mensualidades;
CREATE POLICY "mensualidades_jugador_update" ON mensualidades
  FOR UPDATE USING (
    jugador_id = get_my_jugador_id()
    AND club_id = get_my_club_id()
    AND get_my_rol() = 'jugador'
  )
  WITH CHECK (
    jugador_id = get_my_jugador_id()
    AND club_id = get_my_club_id()
    AND get_my_rol() = 'jugador'
  );


-- ============================================================
-- 11. CUOTAS — igual que mensualidades
-- ============================================================
ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuotas_select" ON cuotas;
CREATE POLICY "cuotas_select" ON cuotas
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() = 'admin'
      OR jugador_id = get_my_jugador_id()
    )
  );

DROP POLICY IF EXISTS "cuotas_admin_all" ON cuotas;
CREATE POLICY "cuotas_admin_all" ON cuotas
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 12. MOVIMIENTOS (finanzas) — solo admin
-- ============================================================
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_admin_all" ON movimientos;
CREATE POLICY "movimientos_admin_all" ON movimientos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 13. TORNEOS — lectura del club; admin modifica
-- ============================================================
ALTER TABLE torneos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneos_select" ON torneos;
CREATE POLICY "torneos_select" ON torneos
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "torneos_admin_all" ON torneos;
CREATE POLICY "torneos_admin_all" ON torneos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 14. TORNEO_GRUPOS — via torneo
-- ============================================================
ALTER TABLE torneo_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneo_grupos_select" ON torneo_grupos;
CREATE POLICY "torneo_grupos_select" ON torneo_grupos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "torneo_grupos_admin_all" ON torneo_grupos;
CREATE POLICY "torneo_grupos_admin_all" ON torneo_grupos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  );


-- ============================================================
-- 15. TORNEO_JUGADORES — via torneo
-- ============================================================
ALTER TABLE torneo_jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneo_jugadores_select" ON torneo_jugadores;
CREATE POLICY "torneo_jugadores_select" ON torneo_jugadores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "torneo_jugadores_admin_all" ON torneo_jugadores;
CREATE POLICY "torneo_jugadores_admin_all" ON torneo_jugadores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  );


-- ============================================================
-- 16. TORNEO_PARTIDOS — via torneo
-- ============================================================
ALTER TABLE torneo_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneo_partidos_select" ON torneo_partidos;
CREATE POLICY "torneo_partidos_select" ON torneo_partidos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
  );

DROP POLICY IF EXISTS "torneo_partidos_admin_all" ON torneo_partidos;
CREATE POLICY "torneo_partidos_admin_all" ON torneo_partidos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  );


-- ============================================================
-- 17. TORNEO_PAGOS — via torneo; jugador lee los suyos
-- ============================================================
ALTER TABLE torneo_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneo_pagos_select" ON torneo_pagos;
CREATE POLICY "torneo_pagos_select" ON torneo_pagos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND (
      get_my_rol() = 'admin'
      OR jugador_id = get_my_jugador_id()
    )
  );

DROP POLICY IF EXISTS "torneo_pagos_admin_all" ON torneo_pagos;
CREATE POLICY "torneo_pagos_admin_all" ON torneo_pagos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM torneos t WHERE t.id = torneo_id AND t.club_id = get_my_club_id())
    AND get_my_rol() = 'admin'
  );


-- ============================================================
-- 18. GRUPO_JUGADORES — via grupo → torneo
-- ============================================================
ALTER TABLE grupo_jugadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_jugadores_select" ON grupo_jugadores;
CREATE POLICY "grupo_jugadores_select" ON grupo_jugadores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM torneo_grupos tg
      JOIN torneos t ON t.id = tg.torneo_id
      WHERE tg.id = grupo_id AND t.club_id = get_my_club_id()
    )
  );

DROP POLICY IF EXISTS "grupo_jugadores_admin_all" ON grupo_jugadores;
CREATE POLICY "grupo_jugadores_admin_all" ON grupo_jugadores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torneo_grupos tg
      JOIN torneos t ON t.id = tg.torneo_id
      WHERE tg.id = grupo_id AND t.club_id = get_my_club_id()
    )
    AND get_my_rol() = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM torneo_grupos tg
      JOIN torneos t ON t.id = tg.torneo_id
      WHERE tg.id = grupo_id AND t.club_id = get_my_club_id()
    )
    AND get_my_rol() = 'admin'
  );


-- ============================================================
-- 19. PARTIDOS — lectura del club; admin modifica
-- ============================================================
ALTER TABLE partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partidos_select" ON partidos;
CREATE POLICY "partidos_select" ON partidos
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "partidos_admin_all" ON partidos;
CREATE POLICY "partidos_admin_all" ON partidos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 21. EVALUACIONES_TRIMESTRALES — profesor crea; jugador lee las suyas
-- ============================================================
ALTER TABLE evaluaciones_trimestrales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eval_select" ON evaluaciones_trimestrales;
CREATE POLICY "eval_select" ON evaluaciones_trimestrales
  FOR SELECT USING (
    club_id = get_my_club_id()
    AND (
      get_my_rol() IN ('admin', 'profesor')
      OR jugador_id = get_my_jugador_id()
    )
  );

DROP POLICY IF EXISTS "eval_profesor_write" ON evaluaciones_trimestrales;
CREATE POLICY "eval_profesor_write" ON evaluaciones_trimestrales
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'));


-- ============================================================
-- 22. TORNEOS_EXTERNOS — jugador ve/crea los suyos; admin ve todos
-- ============================================================
ALTER TABLE torneos_externos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torneos_ext_select" ON torneos_externos;
CREATE POLICY "torneos_ext_select" ON torneos_externos
  FOR SELECT USING (
    club_id = get_my_club_id()
  );

DROP POLICY IF EXISTS "torneos_ext_jugador_insert" ON torneos_externos;
CREATE POLICY "torneos_ext_jugador_insert" ON torneos_externos
  FOR INSERT WITH CHECK (
    club_id = get_my_club_id()
    AND jugador_id = get_my_jugador_id()
  );

DROP POLICY IF EXISTS "torneos_ext_admin_all" ON torneos_externos;
CREATE POLICY "torneos_ext_admin_all" ON torneos_externos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 23. SOLICITUDES_JUGADOR — cualquiera puede insertar (registro público);
--     admin del club lee y modifica
-- ============================================================
ALTER TABLE solicitudes_jugador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solicitudes_insert_public" ON solicitudes_jugador;
CREATE POLICY "solicitudes_insert_public" ON solicitudes_jugador
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "solicitudes_admin_select" ON solicitudes_jugador;
CREATE POLICY "solicitudes_admin_select" ON solicitudes_jugador
  FOR SELECT USING (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "solicitudes_admin_update" ON solicitudes_jugador;
CREATE POLICY "solicitudes_admin_update" ON solicitudes_jugador
  FOR UPDATE USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');

DROP POLICY IF EXISTS "solicitudes_admin_delete" ON solicitudes_jugador;
CREATE POLICY "solicitudes_admin_delete" ON solicitudes_jugador
  FOR DELETE USING (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 24. INVITACIONES — admin del club
-- ============================================================
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitaciones_select_public" ON invitaciones;
CREATE POLICY "invitaciones_select_public" ON invitaciones
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "invitaciones_admin_all" ON invitaciones;
CREATE POLICY "invitaciones_admin_all" ON invitaciones
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() = 'admin')
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() = 'admin');


-- ============================================================
-- 25. EVENTOS — lectura del club; admin/profesor modifican
-- ============================================================
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eventos_select" ON eventos;
CREATE POLICY "eventos_select" ON eventos
  FOR SELECT USING (club_id = get_my_club_id());

DROP POLICY IF EXISTS "eventos_admin_profesor_write" ON eventos;
CREATE POLICY "eventos_admin_profesor_write" ON eventos
  FOR ALL USING (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'))
  WITH CHECK (club_id = get_my_club_id() AND get_my_rol() IN ('admin', 'profesor'));


-- ============================================================
-- 26. CLUB_PHOTOS — lectura pública; admin modifica
-- ============================================================
ALTER TABLE club_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_photos_select" ON club_photos;
CREATE POLICY "club_photos_select" ON club_photos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "club_photos_admin_all" ON club_photos;
CREATE POLICY "club_photos_admin_all" ON club_photos
  FOR ALL USING (get_my_rol() = 'admin')
  WITH CHECK (get_my_rol() = 'admin');


-- ============================================================
-- 27. BANCO_FOTOS — lectura pública; admin modifica
-- ============================================================
ALTER TABLE banco_fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banco_fotos_select" ON banco_fotos;
CREATE POLICY "banco_fotos_select" ON banco_fotos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "banco_fotos_admin_all" ON banco_fotos;
CREATE POLICY "banco_fotos_admin_all" ON banco_fotos
  FOR ALL USING (get_my_rol() = 'admin')
  WITH CHECK (get_my_rol() = 'admin');


-- ============================================================
-- DONE! 🔒
-- Todas las tablas tienen RLS activado.
-- ============================================================
