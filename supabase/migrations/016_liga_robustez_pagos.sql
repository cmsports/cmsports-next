-- ============================================================
-- CmSports — Liga: robustez, pagos e integridad
-- VERSIÓN CORREGIDA (post-revisión)
-- ============================================================
-- ANTES DE CORRER: pegá esta query de diagnóstico en SQL Editor
-- para confirmar los nombres reales de los índices en tu DB:
--
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'liga_partidos' AND indexdef ILIKE '%unique%';
--
--   SELECT conname, contype
--   FROM pg_constraint
--   WHERE conrelid = 'liga_partidos'::regclass AND contype = 'u';
--
-- Si ves nombres distintos a liga_partidos_mesa_bloque_unico
-- o liga_partidos_enfrentamiento_unico, avisame antes de correr esto.
-- ============================================================
-- INSTRUCCIONES:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo y haz clic en "Run"
-- ============================================================

-- ── 1. Eliminar constraint hardcodeado de 5 fechas ─────────────────────────
ALTER TABLE liga_fechas DROP CONSTRAINT IF EXISTS liga_fechas_numero_check;

-- ── 2. Configuración adicional en ligas ────────────────────────────────────
ALTER TABLE ligas ADD COLUMN IF NOT EXISTS total_fechas int NOT NULL DEFAULT 5;
ALTER TABLE ligas ADD COLUMN IF NOT EXISTS monto_inscripcion_default int;
ALTER TABLE ligas ADD COLUMN IF NOT EXISTS bloque_minutos int NOT NULL DEFAULT 30;

-- ── 3. Soft delete + bloqueo optimista ────────────────────────────────────
ALTER TABLE ligas           ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE ligas           ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;
ALTER TABLE liga_divisiones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE liga_divisiones ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;
ALTER TABLE liga_partidos   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE liga_partidos   ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;

-- ── 4. Actualizar índices únicos para respetar soft delete ─────────────────
-- Patrón seguro: intentar drop como CONSTRAINT primero (no-op si era índice
-- puro), luego drop como INDEX (no-op si ya se eliminó como constraint).
-- Cubre migración 013 (CREATE UNIQUE INDEX) y el caso de constraint inline.

ALTER TABLE liga_partidos DROP CONSTRAINT IF EXISTS liga_partidos_mesa_bloque_unico;
DROP INDEX IF EXISTS liga_partidos_mesa_bloque_unico;

ALTER TABLE liga_partidos DROP CONSTRAINT IF EXISTS liga_partidos_enfrentamiento_unico;
DROP INDEX IF EXISTS liga_partidos_enfrentamiento_unico;

CREATE UNIQUE INDEX liga_partidos_mesa_bloque_unico
  ON liga_partidos (fecha_id, mesa_id, bloque_horario)
  WHERE fecha_id IS NOT NULL
    AND mesa_id IS NOT NULL
    AND bloque_horario IS NOT NULL
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX liga_partidos_enfrentamiento_unico
  ON liga_partidos (division_id, LEAST(jugador_a_id, jugador_b_id), GREATEST(jugador_a_id, jugador_b_id))
  WHERE deleted_at IS NULL;

-- ── 5. HC-01: trigger — jugador no puede tener 2 partidos en el mismo bloque
CREATE OR REPLACE FUNCTION check_jugador_disponible_bloque()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_id IS NULL OR NEW.bloque_horario IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM liga_partidos
    WHERE id <> NEW.id
      AND deleted_at IS NULL
      AND fecha_id = NEW.fecha_id
      AND bloque_horario = NEW.bloque_horario
      AND (jugador_a_id = NEW.jugador_a_id OR jugador_b_id = NEW.jugador_a_id)
  ) THEN
    RAISE EXCEPTION 'HC-01: Jugador A ya tiene un partido en este bloque horario';
  END IF;

  IF EXISTS (
    SELECT 1 FROM liga_partidos
    WHERE id <> NEW.id
      AND deleted_at IS NULL
      AND fecha_id = NEW.fecha_id
      AND bloque_horario = NEW.bloque_horario
      AND (jugador_a_id = NEW.jugador_b_id OR jugador_b_id = NEW.jugador_b_id)
  ) THEN
    RAISE EXCEPTION 'HC-01: Jugador B ya tiene un partido en este bloque horario';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_disponibilidad_jugador ON liga_partidos;
CREATE TRIGGER trg_check_disponibilidad_jugador
  BEFORE INSERT OR UPDATE ON liga_partidos
  FOR EACH ROW EXECUTE FUNCTION check_jugador_disponible_bloque();

-- ── 6. Tabla de auditoría ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  user_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_select" ON audit_log;
CREATE POLICY "audit_log_admin_select" ON audit_log
  FOR SELECT USING (get_my_rol() IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (true);

-- ── 7. Pagos de jugadores de liga ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_jugador_pagos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  uuid NOT NULL REFERENCES liga_divisiones(id),
  jugador_id   uuid NOT NULL REFERENCES jugadores(id),
  monto_total  int NOT NULL CHECK (monto_total > 0),
  monto_pagado int NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'parcial', 'pagado')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, jugador_id)
);

-- ── 8. Abonos (pagos parciales) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liga_abonos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id       uuid NOT NULL REFERENCES liga_jugador_pagos(id) ON DELETE CASCADE,
  monto         int NOT NULL CHECK (monto > 0),
  fecha         date NOT NULL,
  metodo        text,
  movimiento_id uuid REFERENCES movimientos(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 9. RLS para tablas de pagos ────────────────────────────────────────────
-- Criterio:
--   SELECT → admin y superadmin únicamente (info financiera sensible)
--   INSERT/UPDATE/DELETE → admin únicamente (consistente con liga_partidos en 013)
-- Los jugadores y profesores no tienen visibilidad sobre pagos de otros.

ALTER TABLE liga_jugador_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_abonos        ENABLE ROW LEVEL SECURITY;

-- liga_jugador_pagos: lectura para admin/superadmin del club
DROP POLICY IF EXISTS "liga_jugador_pagos_select" ON liga_jugador_pagos;
CREATE POLICY "liga_jugador_pagos_select" ON liga_jugador_pagos
  FOR SELECT USING (
    get_my_rol() IN ('admin', 'superadmin')
    AND division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

-- liga_jugador_pagos: escritura solo admin (igual que liga_partidos en 013)
DROP POLICY IF EXISTS "liga_jugador_pagos_admin_all" ON liga_jugador_pagos;
CREATE POLICY "liga_jugador_pagos_admin_all" ON liga_jugador_pagos
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND division_id IN (
      SELECT d.id FROM liga_divisiones d
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

-- liga_abonos: lectura para admin/superadmin del club
DROP POLICY IF EXISTS "liga_abonos_select" ON liga_abonos;
CREATE POLICY "liga_abonos_select" ON liga_abonos
  FOR SELECT USING (
    get_my_rol() IN ('admin', 'superadmin')
    AND pago_id IN (
      SELECT p.id FROM liga_jugador_pagos p
      JOIN liga_divisiones d ON d.id = p.division_id
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );

-- liga_abonos: escritura solo admin
DROP POLICY IF EXISTS "liga_abonos_admin_all" ON liga_abonos;
CREATE POLICY "liga_abonos_admin_all" ON liga_abonos
  FOR ALL USING (
    get_my_rol() = 'admin'
    AND pago_id IN (
      SELECT p.id FROM liga_jugador_pagos p
      JOIN liga_divisiones d ON d.id = p.division_id
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    AND pago_id IN (
      SELECT p.id FROM liga_jugador_pagos p
      JOIN liga_divisiones d ON d.id = p.division_id
      JOIN ligas l ON l.id = d.liga_id
      WHERE l.club_id = get_my_club_id()
    )
  );
