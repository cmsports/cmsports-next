-- El torneo interno "sub19" (Buin, agosto 2026) se cargó con genero = 'varones',
-- pero jugó gente de ambas ramas (ej. Julieta Ivonne Amigo León) y la categoría
-- SUB19 del ranking en papel es mixta —igual que SUB13, SUB15, TC"A" y TCB,
-- confirmado por la asociación cuando se armó la 189—. El saldo de papel de
-- SUB19 ya está cargado como genero = 'mixto' (19 filas).
--
-- Es el mismo bug que la 191 diagnosticó para el SUB13: el ranking agrupa por
-- la clave `categoria||genero` (ver src/app/ranking/page.tsx), así que con
-- genero = 'varones' este torneo arma su propia tabla "SUB19||varones" en vez
-- de sumar a "SUB19||mixto" — silencioso, sin error, y con el papel y el
-- torneo sin verse entre sí.
--
-- A diferencia de la 191, acá no hace falta corregir tipo/estado/categoria:
-- el torneo ya se creó desde /torneos-internos (tipo='interno', categoria=
-- 'SUB19', estado='finalizado'). Solo el género quedó mal.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('193_ranking_sub19_mixto_agosto_2026');

-- Que el torneo esté como se espera antes de tocarlo: si alguien ya lo
-- corrigió o lo reabrió entremedio, mejor que la migración avise en vez de
-- pisar un estado más nuevo con uno viejo.
DO $$
DECLARE t record;
BEGIN
  SELECT id, tipo, estado, categoria, genero INTO t
  FROM public.torneos
  WHERE id = '7f4402e7-02b1-46fb-abd7-bf427fd1e7b8'
    AND club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No existe el torneo sub19 en Buin. Revisar el id antes de seguir.';
  END IF;
  IF t.tipo <> 'interno' OR t.estado <> 'finalizado' OR t.categoria <> 'SUB19' THEN
    RAISE EXCEPTION 'El torneo ya no está como se esperaba (tipo=%, estado=%, categoria=%). Revisar a mano.', t.tipo, t.estado, t.categoria;
  END IF;
  IF t.genero <> 'varones' THEN
    RAISE EXCEPTION 'El torneo ya no tiene genero=varones (tiene %): revisar si ya se corrigió.', t.genero;
  END IF;
END $$;

UPDATE public.torneos SET genero = 'mixto'
WHERE id = '7f4402e7-02b1-46fb-abd7-bf427fd1e7b8'
  AND club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- Que el saldo de papel siga contando: si alguien reinicia el ranking después
-- de esta migración y el saldo quedó antes del reinicio, el SUB19 saldría
-- solo con los puntos del torneo y sin los del papel.
DO $$
DECLARE reinicio timestamptz;
DECLARE saldo_ts timestamptz;
BEGIN
  SELECT ranking_reiniciado_en INTO reinicio
  FROM public.clubes WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
  SELECT min(creado_en) INTO saldo_ts
  FROM public.ranking_saldo_inicial
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND categoria = 'SUB19';

  IF saldo_ts IS NULL THEN
    RAISE EXCEPTION 'No hay saldo SUB19 cargado: revisar antes de seguir.';
  END IF;
  IF reinicio IS NOT NULL AND saldo_ts <= reinicio THEN
    RAISE EXCEPTION 'El saldo del papel quedó antes del último reinicio (%): el SUB19 saldría sin los puntos del papel.', reinicio;
  END IF;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
SELECT nombre, tipo, estado, categoria, genero
FROM public.torneos
WHERE id = '7f4402e7-02b1-46fb-abd7-bf427fd1e7b8';
