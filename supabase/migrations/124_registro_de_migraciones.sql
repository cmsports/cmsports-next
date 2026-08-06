-- Una migración ya aplicada no se puede volver a aplicar.
--
-- Hasta ahora las migraciones de este proyecto se corren pegándolas a mano en
-- el SQL Editor de Supabase, y nada impedía pegarlas dos veces. Así fue como
-- `089_arranque_limpio_buin.sql` se ejecutó de nuevo y destruyó datos reales
-- del club (un ingreso de $3.191.300 y dos sueldos), esta vez sin respaldo:
-- su copia de seguridad usaba `CREATE TABLE IF NOT EXISTS`, que en la segunda
-- pasada no hace nada mientras el DELETE de más abajo corre igual.
--
-- Esto agrega lo que hace cualquier sistema de migraciones serio: un registro
-- de lo ya aplicado y un portazo si alguien repite algo.
--
-- ══ Cómo se usa de acá en adelante ════════════════════════════════════════
--
-- Toda migración nueva empieza así, justo después del BEGIN:
--
--     BEGIN;
--     SELECT _migracion_nueva('125_nombre_del_archivo');
--     ... el resto ...
--     COMMIT;
--
-- Si ya se aplicó, esa línea lanza una excepción, la transacción se aborta
-- entera y no se ejecuta nada de lo que viene abajo. El error es la
-- protección: mejor un mensaje feo que una tabla vacía.
--
-- Las migraciones que solo hacen `CREATE OR REPLACE FUNCTION` son inofensivas
-- al repetirse, pero igual conviene registrarlas: así el registro sirve
-- también para saber qué se aplicó y cuándo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS _migraciones_aplicadas (
  nombre      text PRIMARY KEY,
  aplicada_en timestamptz NOT NULL DEFAULT now(),
  aplicada_por text NOT NULL DEFAULT current_user
);

ALTER TABLE _migraciones_aplicadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE _migraciones_aplicadas FROM anon, authenticated;

COMMENT ON TABLE _migraciones_aplicadas IS
  'Migraciones ya ejecutadas. Ver docs/migraciones-destructivas.md. Borrar una fila de acá habilita re-ejecutar esa migración: hacerlo solo a conciencia.';


-- Portazo: si el nombre ya está registrado, revienta y aborta la transacción.
CREATE OR REPLACE FUNCTION _migracion_nueva(p_nombre text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha timestamptz;
BEGIN
  SELECT aplicada_en INTO v_fecha
  FROM _migraciones_aplicadas WHERE nombre = p_nombre;

  IF FOUND THEN
    RAISE EXCEPTION
      'La migración "%" ya se aplicó el %. Repetirla puede destruir datos, así que no se ejecutó nada. Si de verdad hay que volver a correrla, borra su fila de _migraciones_aplicadas a conciencia.',
      p_nombre, v_fecha;
  END IF;

  INSERT INTO _migraciones_aplicadas (nombre) VALUES (p_nombre);
END;
$$;

REVOKE EXECUTE ON FUNCTION _migracion_nueva(text) FROM PUBLIC, anon, authenticated;


-- ══ Se registra lo ya corrido que es peligroso repetir ════════════════════
-- Solo las destructivas: son las que borran datos si alguien las repite. El
-- resto crea o reemplaza funciones y no hace daño al reejecutarse.
INSERT INTO _migraciones_aplicadas (nombre, aplicada_por) VALUES
  ('089_arranque_limpio_buin',            'registro retroactivo'),
  ('124_registro_de_migraciones',         current_user)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- 1) El registro quedó creado y con las filas iniciales.
SELECT nombre, aplicada_en FROM _migraciones_aplicadas ORDER BY nombre;

-- 2) El portazo funciona: esto DEBE fallar con "ya se aplicó".
--    Descomenta para probarlo; déjalo comentado al guardar.
-- SELECT _migracion_nueva('124_registro_de_migraciones');
