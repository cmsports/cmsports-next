-- ────────────────────────────────────────────────────────────
-- Las seis categorías propias del club, aceptadas también por la base.
--
-- Este cambio afecta a: **todos los clubes en el esquema, ninguno en su
-- comportamiento.** Solo ensancha una lista blanca. Ningún club ve una
-- categoría que su formulario no le ofrezca.
--
-- ══ El bug, y por qué no lo vio nadie ═════════════════════════════════════
--
-- El módulo 'finanzas_categorias' agregó a Spinhouse cuatro categorías de
-- ingreso (clases particulares, arriendo de mesas, venta de artículos,
-- auspicios) y dos de gasto (premios de liga, marketing). Se agregaron en
-- `src/lib/domain/categoriasFinanzas.ts` —lo que el formulario OFRECE— y en
-- `src/lib/validation/finanzas.ts` —lo que el servidor de Next ACEPTA—.
--
-- Faltó el tercer lugar: `registrar_movimiento_financiero_atomico`, que valida
-- la categoría contra una lista blanca escrita DENTRO de la propia función.
-- Toda operación financiera pasa por ese RPC, así que hoy Cristhian elige
-- "Arriendo de mesa" en un desplegable que se lo ofrece, aprieta guardar y la
-- base responde:
--
--     Categoría incompatible con el tipo de movimiento
--
-- Es exactamente el problema que la migración 099 dejó documentado en su
-- encabezado cuando agregó `clase_extraordinaria`:
--
--   > "Una categoría nueva es rechazada hasta que esa lista la incluya."
--
-- ⚠️ Y de ahí la lección que vale más que el arreglo: **una categoría nueva se
-- agrega en TRES lugares.** El catálogo del dominio, el esquema de validación
-- y esta función. Dos de tres no da un error de compilación ni una prueba en
-- rojo: da una pantalla que ofrece algo que la base rechaza.
--
-- ══ Por qué la lista de acá no se hace por club ══════════════════════════
--
-- Es una lista blanca de textos aceptados, no una lista de lo que se ofrece.
-- Que la base acepte 'auspicio' no le pone la opción a Buin en ninguna
-- pantalla: eso lo decide el módulo, en el catálogo del dominio. Leer la
-- configuración del club dentro de esta función sería mucho aparato para
-- proteger contra un caso que no existe —nadie puede elegir lo que su
-- formulario no muestra— y le agregaría una consulta a cada movimiento.
--
-- ══ Lo que NO cambia ═════════════════════════════════════════════════════
--
-- El cuerpo de la función es idéntico al de la 138 salvo las dos listas. Se
-- copia entero porque `CREATE OR REPLACE` reemplaza todo y no hay forma de
-- editar una sola línea; comparar contra la 138 para revisar el diff.
--
-- Las claves existentes no se tocan ni se renombran: los movimientos de Buin
-- ya están guardados con las suyas y renombrarlas rompería todos sus reportes.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)
-- ────────────────────────────────────────────────────────────

BEGIN;
SELECT _migracion_nueva('258_categorias_propias_en_el_rpc');
-- No es de un club: cambia una función que usan los seis, y no toca ni una
-- fila. Declararlo a propósito, con el motivo, en vez de omitirlo.
SELECT _migracion_para_todos_los_clubes('ensancha una lista blanca en un RPC; no toca filas de ningún club');

CREATE OR REPLACE FUNCTION public.registrar_movimiento_financiero_atomico(
  p_tipo text,
  p_categoria text,
  p_descripcion text,
  p_monto integer,
  p_fecha date,
  p_profesor_id uuid,
  p_mes_correspondiente integer,
  p_anio_correspondiente integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid; v_user_id uuid; v_admin_nombre text;
  v_repetida jsonb; v_resultado jsonb; v_movimiento_id uuid;
BEGIN
  SELECT c.club_id, c.user_id, c.nombre INTO v_club_id, v_user_id, v_admin_nombre
  FROM public._finanzas_admin_contexto() c;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ingreso', 'gasto') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  -- Las seis del final son las que suma el módulo 'finanzas_categorias'.
  -- El resto es exactamente la lista de la migración 138.
  IF p_categoria IS NULL
     OR (p_tipo = 'ingreso' AND p_categoria NOT IN (
           'mensualidad','matricula','inscripcion_torneo','inscripcion_liga',
           'arriendo_cancha','donacion','otro_ingreso',
           'clase_particular','arriendo_mesa','venta_articulos','auspicio'))
     OR (p_tipo = 'gasto' AND p_categoria NOT IN (
           'sueldo_profesor','sueldo_staff','arriendo_cancha','material_deportivo',
           'servicios_basicos','mantenimiento','premio_torneo','otro_gasto',
           'premio_liga','marketing')) THEN
    RAISE EXCEPTION 'Categoría incompatible con el tipo de movimiento';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF p_fecha IS NULL OR p_fecha < DATE '2000-01-01' OR p_fecha > DATE '2100-12-31' THEN RAISE EXCEPTION 'Fecha inválida'; END IF;
  IF nullif(btrim(p_descripcion), '') IS NULL OR length(btrim(p_descripcion)) > 500 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
  IF (p_mes_correspondiente IS NULL) <> (p_anio_correspondiente IS NULL) THEN RAISE EXCEPTION 'Mes y año deben informarse juntos'; END IF;
  IF p_mes_correspondiente IS NOT NULL AND (p_mes_correspondiente NOT BETWEEN 1 AND 12 OR p_anio_correspondiente NOT BETWEEN 2000 AND 2100) THEN RAISE EXCEPTION 'Mes o año inválido'; END IF;
  IF p_categoria IN ('sueldo_profesor','sueldo_staff') AND p_mes_correspondiente IS NULL THEN RAISE EXCEPTION 'Los sueldos requieren mes y año'; END IF;
  IF p_profesor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profesores WHERE id = p_profesor_id AND club_id = v_club_id) THEN RAISE EXCEPTION 'Profesor no encontrado en el club'; END IF;

  v_repetida := public._finanzas_reclamar_operacion(v_club_id, v_user_id, p_idempotency_key, 'movimiento_manual');
  IF v_repetida IS NOT NULL THEN RETURN v_repetida; END IF;

  INSERT INTO public.movimientos (
    club_id, tipo, categoria, descripcion, monto, fecha, profesor_id,
    mes_correspondiente, anio_correspondiente, registrado_por_nombre
  ) VALUES (
    v_club_id, p_tipo, p_categoria, btrim(p_descripcion), p_monto, p_fecha, p_profesor_id,
    p_mes_correspondiente, p_anio_correspondiente, v_admin_nombre
  ) RETURNING id INTO v_movimiento_id;

  INSERT INTO public.audit_log (club_id, entity_type, entity_id, action, after, user_id)
  VALUES (v_club_id, 'movimientos', v_movimiento_id, 'crear',
    jsonb_build_object('tipo', p_tipo, 'categoria', p_categoria, 'monto', p_monto), v_user_id);

  v_resultado := jsonb_build_object('movimiento_id', v_movimiento_id);
  UPDATE public.finanzas_operaciones SET resultado = v_resultado
  WHERE club_id = v_club_id AND clave = p_idempotency_key;
  RETURN v_resultado;
END;
$$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
--
-- Que las seis nuevas están en el cuerpo de la función:
--
--   SELECT p.proname,
--          prosrc LIKE '%arriendo_mesa%'   AS acepta_arriendo_mesa,
--          prosrc LIKE '%venta_articulos%' AS acepta_venta,
--          prosrc LIKE '%marketing%'       AS acepta_marketing
--   FROM   pg_proc p
--   WHERE  p.proname = 'registrar_movimiento_financiero_atomico';
--   -- Las tres tienen que dar true.
--
-- Que las de siempre siguen estando (si alguna diera false, el copiado se
-- comió una y hay que volver a la 138):
--
--   SELECT prosrc LIKE '%matricula%'          AS matricula,
--          prosrc LIKE '%inscripcion_torneo%' AS torneo,
--          prosrc LIKE '%premio_torneo%'      AS premio_torneo
--   FROM   pg_proc WHERE proname = 'registrar_movimiento_financiero_atomico';
--
-- Y la prueba de verdad, desde la pantalla: entrar a /finanzas con la cuenta
-- de Spinhouse, registrar un ingreso de "Arriendo de mesa" por $1 y ver que
-- guarda. Después borrarlo.
