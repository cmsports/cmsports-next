-- ────────────────────────────────────────────────────────────
-- Registro de actividad: quién usa la app, en qué pantalla y cuánto rato.
--
-- Cada fila es un "tramo": el cliente manda un ping al entrar a una ruta
-- (segundos = 0, marca la VISITA) y después uno cada ~60 s con los segundos
-- que estuvo ahí con la pestaña visible. Esa convención es la que usa el
-- ranking de módulos para separar "tiempo acumulado" de "número de visitas"
-- (ver `src/lib/domain/actividad.ts`): las filas con segundos = 0 son llegadas,
-- las demás son tiempo. Por eso los pings periódicos nunca mandan 0.
--
-- PRIVACIDAD: acá va la RUTA y el MÓDULO, nunca el contenido de la pantalla ni
-- los parámetros de la URL. La query string se corta en el cliente antes de
-- enviar (`rutaSinParametros`) y no hay columna donde guardarla.
--
-- VOLUMEN / RETENCIÓN: esta tabla crece rápido —del orden de un ping por
-- usuario por minuto activo—. La política acordada es conservar 90 días y
-- borrar lo anterior. NO está automatizada todavía (no hay cron en el
-- proyecto); mientras tanto se hace a mano, y el borrado es barato porque el
-- índice por `ocurrido_en` cubre exactamente ese filtro:
--
--   DELETE FROM actividad WHERE ocurrido_en < now() - interval '90 days';
--
-- Perder filas viejas no rompe nada: el panel mira los últimos 30 días.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS actividad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Si se borra la cuenta, el rastro queda pero se despersonaliza.
  usuario_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id     uuid REFERENCES clubes(id) ON DELETE SET NULL,
  -- Rol y club se copian al momento del ping en vez de leerse del perfil: si
  -- mañana el usuario cambia de rol o de club, el histórico no debe reescribirse.
  rol         text,
  ruta        text NOT NULL CHECK (ruta LIKE '/%' AND position('?' in ruta) = 0),
  modulo      text,
  segundos    integer NOT NULL DEFAULT 0 CHECK (segundos >= 0),
  ocurrido_en timestamptz NOT NULL DEFAULT now()
);

-- Los dos accesos reales del panel: la ventana de tiempo (últimos 5 min, 30
-- días) y el agrupado por persona. El de fecha va DESC porque todas las
-- consultas piden lo más reciente.
CREATE INDEX IF NOT EXISTS actividad_ocurrido_en_idx ON actividad(ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS actividad_usuario_idx ON actividad(usuario_id);

ALTER TABLE actividad ENABLE ROW LEVEL SECURITY;

-- Lectura: solo el superadmin. Es un registro transversal a todos los clubes;
-- ni el admin de un club ve por dónde se mueve su gente.
DROP POLICY IF EXISTS actividad_lectura_superadmin ON actividad;
CREATE POLICY actividad_lectura_superadmin ON actividad
  FOR SELECT USING (get_my_rol() = 'superadmin');

-- Escritura: la hace la Server Action con service role, que es la única que
-- puede garantizar que `usuario_id` sale de la sesión y no de un parámetro del
-- cliente. Desde el navegador se bloquea todo, para que nadie pueda inflar sus
-- propias estadísticas ni escribir actividad a nombre de otro.
DROP POLICY IF EXISTS actividad_escritura_bloqueada ON actividad;
CREATE POLICY actividad_escritura_bloqueada ON actividad
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
