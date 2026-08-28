-- ────────────────────────────────────────────────────────────
-- Arregla `feedback_de_profesores()`: «column reference "id" is ambiguous».
--
-- Este cambio afecta a: Spinhouse (es el único club con el módulo
-- `feedback_profes`), pero la función es de esquema y se corrige para todos.
--
-- EL ERROR. La función declara `RETURNS TABLE (id uuid, ...)`, y en PL/pgSQL
-- cada columna de salida es además una variable. La primera línea del cuerpo
-- decía:
--
--   SELECT club_id, rol INTO v_club, v_rol FROM perfiles WHERE id = auth.uid();
--                                                              ↑ sin calificar
--
-- Con `id` a secas, Postgres no sabe si es la variable de salida o la columna
-- `perfiles.id`, y aborta. La pantalla del profesor mostraba el error y
-- «Todavía no hay comentarios de los alumnos», que era doblemente confuso:
-- parecía que no había datos cuando en realidad la consulta nunca corrió.
--
-- Solo cambia esa línea. El resto del cuerpo ya venía calificado y la promesa
-- del anonimato —el `CASE WHEN f.anonimo THEN NULL`— queda intacta.
--
-- Por qué una migración nueva y no editar la 228: la 228 ya está aplicada y su
-- portazo `_migracion_nueva` impide volver a correrla. `CREATE OR REPLACE
-- FUNCTION` reemplaza el cuerpo sin tocar la tabla ni las políticas.
--
-- El mismo patrón se revisó en las funciones de las migraciones 226 y 227: ahí
-- `id` no es columna de salida de ninguna, así que no tienen este problema.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('230_fix_feedback_de_profesores_id_ambiguo');

CREATE OR REPLACE FUNCTION public.feedback_de_profesores(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
) RETURNS TABLE (
  id              uuid,
  profesor_id     uuid,
  profesor_nombre text,
  fecha           date,
  comentario      text,
  anonimo         boolean,
  autor           text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
DECLARE
  v_club uuid;
  v_rol  text;
  v_yo   uuid;
BEGIN
  -- `perfiles.id` calificado: `id` a secas choca con la columna de salida.
  SELECT p.club_id, p.rol INTO v_club, v_rol
  FROM perfiles p WHERE p.id = auth.uid();

  -- El NULL se comprueba aparte: `NULL NOT IN (...)` no es verdadero y dejaría
  -- pasar a quien no tiene rol.
  IF v_rol IS NULL OR v_rol NOT IN ('admin','superadmin','profesor') THEN
    RAISE EXCEPTION 'Solo el admin o el profesor pueden leer este feedback';
  END IF;

  -- Un profesor sin ficha enlazada no ve nada, en vez de verlo todo: si
  -- get_my_profesor_id() devuelve NULL, el filtro de abajo no encuentra fila.
  v_yo := get_my_profesor_id();

  RETURN QUERY
  SELECT
    f.id,
    f.profesor_id,
    pr.nombre,
    f.fecha,
    f.comentario,
    f.anonimo,
    -- Acá vive toda la promesa del anonimato.
    CASE WHEN f.anonimo THEN NULL ELSE j.nombre END
  FROM feedback_profesores f
  JOIN profesores pr ON pr.id = f.profesor_id
  JOIN jugadores  j  ON j.id  = f.jugador_id
  WHERE f.club_id = v_club
    AND (p_desde IS NULL OR f.fecha >= p_desde)
    AND (p_hasta IS NULL OR f.fecha <= p_hasta)
    AND (v_rol IN ('admin','superadmin') OR f.profesor_id = v_yo)
  ORDER BY f.fecha DESC, f.creado_en DESC;
END $$;

REVOKE ALL ON FUNCTION public.feedback_de_profesores(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.feedback_de_profesores(date, date) TO authenticated;

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Como admin de Spinhouse, tiene que devolver filas y NO tirar error. Las
-- anónimas salen con autor en NULL:
--
-- SELECT anonimo, autor, left(comentario, 40) AS comentario
-- FROM feedback_de_profesores() ORDER BY anonimo DESC LIMIT 10;
--
-- Y esta tiene que dar 0 — ninguna anónima puede traer autor:
-- SELECT count(*) FROM feedback_de_profesores() WHERE anonimo AND autor IS NOT NULL;
