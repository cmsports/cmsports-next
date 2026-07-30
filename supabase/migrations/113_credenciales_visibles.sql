-- ────────────────────────────────────────────────────────────
-- Tabla espejo de contraseñas en texto plano.
--
-- El admin del club necesita imprimir una hoja con nombre, usuario y
-- contraseña de cada alumno para entregarles el acceso. Auth guarda solo el
-- hash (irreversible), así que se lleva un espejo en texto plano de las
-- contraseñas que este sistema genera o recibe en solicitudes.
--
-- Riesgo asumido y documentado: si esta tabla se filtra, se filtran todas
-- las contraseñas iniciales. Se acota con RLS estricto —solo el admin del
-- mismo club la lee— y con borrado en cascada al eliminar el usuario.
--
-- Lo que NO va acá: contraseñas que el jugador cambió por su cuenta después
-- del primer ingreso. El sistema no las conoce y esta tabla no las inventa;
-- el admin las verá desactualizadas hasta que use el botón de reseteo.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credencial_visible (
  usuario_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  password_plano text NOT NULL,
  usuario_login  text NOT NULL,
  tipo_login     text NOT NULL CHECK (tipo_login IN ('email','celular','rut')),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credencial_visible_club_idx ON credencial_visible(club_id);

ALTER TABLE credencial_visible ENABLE ROW LEVEL SECURITY;

-- Lectura: solo admin/superadmin del mismo club. El profesor NO ve
-- contraseñas —es dato sensible y no está en su tarea.
DROP POLICY IF EXISTS credencial_visible_lectura ON credencial_visible;
CREATE POLICY credencial_visible_lectura ON credencial_visible
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid()
        AND p.club_id = credencial_visible.club_id
        AND p.rol IN ('admin', 'superadmin')
    )
  );

-- Escritura: se hace desde server actions con service role. Se bloquea la
-- escritura por RLS para que nadie logueado normal pueda insertar o cambiar.
DROP POLICY IF EXISTS credencial_visible_escritura ON credencial_visible;
CREATE POLICY credencial_visible_escritura ON credencial_visible
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
