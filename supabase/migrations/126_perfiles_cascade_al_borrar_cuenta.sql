-- ────────────────────────────────────────────────────────────
-- Borrar una cuenta de auth debe llevarse su fila de `perfiles`.
--
-- Hoy no lo hace: la FK `perfiles.id -> auth.users(id)` no tiene ON DELETE
-- CASCADE, así que eliminar el usuario deja el perfil colgando. Se detectó
-- borrando una cuenta de prueba, pero pasa con cualquier borrado que no se
-- acuerde de limpiar las dos tablas a mano.
--
-- Por qué importa y no es cosmético: `perfiles` es de donde salen el rol y el
-- club en TODAS las consultas de permisos (`get_my_rol`, `get_my_club_id`). Un
-- perfil huérfano es una fila con rol y club que ya no le corresponde a nadie;
-- si el id se reutilizara, heredaría permisos ajenos. Además ensucia los
-- listados del club con gente que ya no existe.
--
-- Hay un trigger que crea el perfil al crear la cuenta. Esto es la otra mitad:
-- la cuenta y su perfil nacen juntos, así que también tienen que morir juntos.
--
-- El nombre del constraint se busca en el catálogo en vez de escribirlo a mano:
-- puede haber quedado con distinto nombre según cómo se creó la tabla.
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'perfiles'
    AND con.contype = 'f'
    AND con.conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'id'
    )]::smallint[];

  IF v_constraint IS NULL THEN
    RAISE NOTICE 'perfiles.id no tiene FK hacia auth.users; no hay nada que cambiar';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.perfiles DROP CONSTRAINT %I', v_constraint);

  ALTER TABLE public.perfiles
    ADD CONSTRAINT perfiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

-- Limpieza de lo que haya quedado colgando de borrados anteriores.
DELETE FROM public.perfiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
