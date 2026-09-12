-- Códigos QR para imprimir: el de acceso (login) y uno por ranking, para Buin.
--
-- Este cambio afecta a: Asociación TDM Buin y Paine. La columna es de esquema
-- (todos los clubes la tienen), pero solo Buin recibe un código y el módulo.
--
-- ══ Qué pidió el club ══════════════════════════════════════════════════════
-- Un QR pegado en la sede que lleve al login de la app, y un QR por cada
-- ranking (categoría y género) que lleve SIEMPRE al ranking actualizado.
-- Quien escanea el del ranking no tiene cuenta —es el papá en la puerta—,
-- así que el ranking que abre es una página pública: nombre y puntos, nada
-- de la ficha.
--
-- ══ Cómo queda ════════════════════════════════════════════════════════════
--   · `clubes.codigo_publico`: el código que va en la URL pública
--     (/ranking-publico/<código>). Opaco y único, como el `codigo` de un
--     torneo para /vivo. NULL para los clubes que no lo usan.
--   · Módulo `qr_publico`: enciende la hoja imprimible (/qr) en el dashboard
--     y en el ranking, y es lo que la API pública comprueba antes de
--     responder. Sin el módulo, tener el código no sirve de nada: la página
--     da 404. Apagado por defecto en el catálogo, porque publica nombres de
--     jugadores fuera de la app y eso lo decide cada club.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('270_qr_publico_buin');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');

-- 1) La columna, para todos, vacía.
ALTER TABLE public.clubes
  ADD COLUMN IF NOT EXISTS codigo_publico text UNIQUE;

COMMENT ON COLUMN public.clubes.codigo_publico IS
  'Código opaco de las páginas públicas del club (/ranking-publico/<código>). Solo sirve con el módulo qr_publico encendido.';

-- 2) El código de Buin: 8 caracteres en mayúscula, sin ambigüedad visual
--    (sin 0/O ni 1/I/L), generado acá y no escrito a mano. Si ya tenía uno,
--    se respeta: cambiarlo dejaría inservibles los QR ya impresos.
DO $$
DECLARE
  v_club  uuid := current_setting('cmsports.club_declarado', true)::uuid;
  v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_i int;
BEGIN
  IF (SELECT codigo_publico FROM public.clubes WHERE id = v_club) IS NOT NULL THEN
    RAISE NOTICE 'Buin ya tenía código público; se conserva.';
  ELSE
    LOOP
      v_codigo := '';
      FOR v_i IN 1..8 LOOP
        v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clubes WHERE codigo_publico = v_codigo);
    END LOOP;
    UPDATE public.clubes SET codigo_publico = v_codigo WHERE id = v_club;
    RAISE NOTICE 'Código público de Buin: %', v_codigo;
  END IF;

  -- 3) El módulo, sumado al array actual (nunca una lista escrita a mano:
  --    eso borraría los módulos que el club ya tiene).
  UPDATE public.clubes
  SET    modulos_habilitados = array_append(COALESCE(modulos_habilitados, ARRAY[]::text[]), 'qr_publico')
  WHERE  id = v_club
    AND  NOT ('qr_publico' = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
END $$;

COMMIT;


-- ── Verificación: correr aparte, después del COMMIT (solo lectura) ──────────

-- Solo Buin tiene código y módulo; el resto NULL / false.
-- SELECT nombre, codigo_publico, 'qr_publico' = ANY(modulos_habilitados) AS tiene_qr
-- FROM public.clubes ORDER BY nombre;
