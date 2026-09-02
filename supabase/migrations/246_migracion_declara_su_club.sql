-- ────────────────────────────────────────────────────────────
-- Toda migración declara a qué club apunta.
--
-- Este cambio afecta a: TODOS los clubes. Es infraestructura, no datos: crea
-- dos funciones y no toca una sola fila de ningún club.
--
-- ══ Qué problema resuelve ═════════════════════════════════════════════════
--
-- `_migracion_nueva` (migración 128) impide correr DOS VECES la misma
-- migración. Nació de la 089, que se pegó dos veces y destruyó plata real.
--
-- Pero no impide lo otro: correr UNA VEZ una migración correcta **en el club
-- equivocado**. Hoy nada lo impide. Hay 36 migraciones con el UUID de Buin
-- escrito adentro, se pegan a mano en el SQL Editor, no hay runner ni CI, y
-- el único filtro es que la persona que copia y pega no se equivoque de UUID.
--
-- Se vienen clubes que funcionan distinto —Spinhouse el primero—, así que la
-- próxima migración destructiva no va a fallar por repetición: va a fallar por
-- destinatario. Para eso todavía no había portazo.
--
-- ══ Cómo se usa de acá en adelante ════════════════════════════════════════
--
--     BEGIN;
--     SELECT _migracion_nueva('247_nombre_del_archivo');
--     SELECT _migracion_para_club('Asociación TDM Buin y Paine');
--     ... el resto ...
--     COMMIT;
--
-- La segunda línea hace tres cosas:
--
--   1. Verifica que ese club exista. Si no, revienta y aborta todo.
--   2. Devuelve su `club_id`, para usarlo SIN escribirlo a mano.
--   3. Lo deja declarado en la sesión, que es lo que habilita el trigger de
--      la migración 247 — el portazo de verdad.
--
-- Para lo que de verdad es para todos, existe la variante explícita
-- `_migracion_para_todos_los_clubes('motivo')`. No es el default: es una
-- decisión que alguien tuvo que escribir, con su razón al lado.
--
-- Ver `docs/plan-aislamiento-clubes.md` §3, capa 2.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: 2026-09-02
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('246_migracion_declara_su_club');


-- ══ 1. El club destino ════════════════════════════════════════════════════
--
-- Recibe el NOMBRE, no el UUID. Ese es el punto: un UUID mal copiado se ve
-- igual de bien que uno correcto, y "Asociación TDM Buin y Paine" no.
--
-- La comparación es `lower(trim(...))` porque es la que ya usa el proyecto
-- para emparejar nombres (migración 073, al insertar profesores). Un nombre
-- ambiguo —dos clubes que se llaman igual— también aborta: es peor adivinar
-- que fallar.
CREATE OR REPLACE FUNCTION public._migracion_para_club(p_club text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_cuantos int;
  v_lista   text;
BEGIN
  IF p_club IS NULL OR btrim(p_club) = '' THEN
    RAISE EXCEPTION
      'Hay que decir a qué club apunta esta migración. Ejemplo: SELECT _migracion_para_club(''Asociación TDM Buin y Paine'');';
  END IF;

  SELECT count(*) INTO v_cuantos
  FROM clubes WHERE lower(btrim(nombre)) = lower(btrim(p_club));

  IF v_cuantos = 0 THEN
    SELECT string_agg(nombre, ' · ' ORDER BY nombre) INTO v_lista FROM clubes;
    RAISE EXCEPTION
      'No existe ningún club llamado "%". No se ejecutó nada. Los clubes de esta base son: %',
      p_club, coalesce(v_lista, '(ninguno)');
  END IF;

  IF v_cuantos > 1 THEN
    RAISE EXCEPTION
      'Hay % clubes llamados "%". No se ejecutó nada: con el nombre ambiguo no hay forma de saber a cuál apunta la migración.',
      v_cuantos, p_club;
  END IF;

  SELECT id INTO v_id
  FROM clubes WHERE lower(btrim(nombre)) = lower(btrim(p_club));

  -- El tercer argumento en true es `is_local`, o sea SET LOCAL: la variable
  -- vive hasta el COMMIT o el ROLLBACK de ESTA transacción y desaparece.
  --
  -- Esto NO es un detalle de estilo. Con `SET` a secas la variable quedaría
  -- pegada a la conexión, y Supabase usa un pooler: esa misma conexión la
  -- reutiliza después cualquier request de la app. El trigger de la migración
  -- 247 empezaría a rechazar escrituras normales de otros clubes, sin que
  -- nadie entienda por qué. Siempre `true`.
  PERFORM set_config('cmsports.club_declarado', v_id::text, true);

  RAISE NOTICE 'Migración declarada para: % (%)', p_club, v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public._migracion_para_club(text) IS
  'Declara el club destino de una migración: verifica que exista, devuelve su id y lo deja en la sesión para el trigger de guardia. Ver docs/plan-aislamiento-clubes.md.';


-- ══ 2. La variante para todos, que hay que escribir a propósito ═══════════
--
-- Deja la variable SIN poner, que es lo mismo que no llamar a nada — el
-- trigger de la 247 queda inerte y la migración puede escribir en cualquier
-- club. Entonces, ¿para qué existe?
--
-- Para que quede escrito. Una migración sin ninguna de las dos líneas puede
-- ser global a propósito o puede ser un olvido, y desde afuera se ven igual.
-- Con esta, la intención está firmada y el motivo también: el argumento es
-- obligatorio y no acepta texto vacío.
--
-- Además limpia la variable, por si alguien encadenó dos declaraciones en la
-- misma transacción.
CREATE OR REPLACE FUNCTION public._migracion_para_todos_los_clubes(p_motivo text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION
      'Una migración global tiene que decir POR QUÉ lo es, en una frase. Ejemplo: SELECT _migracion_para_todos_los_clubes(''cambia el esquema, no toca filas de ningún club'');';
  END IF;

  PERFORM set_config('cmsports.club_declarado', '', true);
  RAISE NOTICE 'Migración global. Motivo: %', p_motivo;
END;
$$;

COMMENT ON FUNCTION public._migracion_para_todos_los_clubes(text) IS
  'Declara explícitamente que una migración es para todos los clubes, con su motivo escrito. Deja el trigger de guardia inerte a propósito.';


-- ══ 3. Nadie las llama desde la app ═══════════════════════════════════════
-- Mismo criterio que `_migracion_nueva`: son herramientas de quien pega SQL a
-- mano, no de la aplicación.
REVOKE EXECUTE ON FUNCTION public._migracion_para_club(text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._migracion_para_todos_los_clubes(text)
  FROM PUBLIC, anon, authenticated;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Correr después del COMMIT, una por una.

-- 1) Los clubes de esta base, con su nombre exacto. Es lo que hay que escribir
--    en la primera línea de cada migración de acá en adelante.
-- SELECT id, nombre FROM clubes ORDER BY nombre;

-- 2) El camino feliz: devuelve el uuid de Buin sin que nadie lo escriba.
--    (Fuera de una transacción la variable se pierde al terminar; da igual,
--    acá solo se comprueba que resuelva el nombre.)
-- SELECT _migracion_para_club('Asociación TDM Buin y Paine');

-- 3) El portazo: esto DEBE fallar con "No existe ningún club llamado".
-- SELECT _migracion_para_club('Club Que No Existe');

-- 4) El motivo es obligatorio: esto DEBE fallar.
-- SELECT _migracion_para_todos_los_clubes('porque sí');
