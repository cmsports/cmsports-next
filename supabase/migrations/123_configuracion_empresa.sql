-- ────────────────────────────────────────────────────────────
-- Datos legales de la empresa que opera CmSports.
--
-- No es configuración "por club": es la identidad de la plataforma que factura
-- a los clubes. Por eso no lleva `club_id` y por eso la tabla tiene una sola
-- fila. Un contrato o una boleta emitida con la razón social equivocada es un
-- problema legal, no un bug de UI, así que la unicidad se impone en la base y
-- no en la pantalla: si mañana alguien inserta desde SQL o desde otra Action,
-- el índice lo rechaza igual.
--
-- Los campos nacen todos NULL a propósito. Los llena Marcela desde la
-- escritura de constitución; cualquier valor por defecto acá sería un dato
-- legal inventado que después nadie sabría distinguir de uno real.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social         text,
  nombre_fantasia      text,
  rut                  text,
  giro                 text,
  domicilio            text,
  comuna               text,
  ciudad               text,
  email_contacto       text,
  telefono             text,
  representante_nombre text,
  representante_rut    text,
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);

-- Fila única: el índice es sobre una constante, así la segunda inserción
-- choca sin importar qué valores traiga. Se prefirió esto a un CHECK sobre
-- una columna fija (que igual necesitaría un unique) por ser una sola línea.
CREATE UNIQUE INDEX IF NOT EXISTS configuracion_empresa_fila_unica
  ON configuracion_empresa ((true));

ALTER TABLE configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- Solo el superadmin. Un admin de club no tiene por qué ver el RUT ni el
-- domicilio del representante legal de la empresa que le cobra, y menos
-- editarlos: la misma política cubre lectura y escritura para que no puedan
-- desincronizarse entre sí.
DROP POLICY IF EXISTS configuracion_empresa_solo_superadmin ON configuracion_empresa;
CREATE POLICY configuracion_empresa_solo_superadmin ON configuracion_empresa
  FOR ALL
  USING      (get_my_rol() = 'superadmin')
  WITH CHECK (get_my_rol() = 'superadmin');
