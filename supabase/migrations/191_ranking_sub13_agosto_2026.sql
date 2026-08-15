-- El torneo "RANKING SUB 13" pasa a contar para el ranking.
--
-- ── Qué pasó ──────────────────────────────────────────────────────────────
-- El torneo está entero y bien cargado: sus 14 partidos, con las fases
-- correctas (grupos, cuartos, semis, final), los dos BYE y las 8 fichas reales.
-- Deportivamente no falta nada. Pero el ranking no lo ve, y no da ningún error
-- mientras no lo ve — igual que el problema de `supabase_realtime`: se calcula
-- perfecto, sobre un conjunto al que este torneo nunca entró.
--
-- Son cuatro campos de la fila del torneo, y cada uno lo deja afuera por su
-- cuenta (ver src/app/ranking/page.tsx, paso 2):
--
--   · tipo = 'externo'      → la consulta filtra .eq('tipo','interno').
--   · estado = 'en_curso'   → filtra .in('estado', ['finalizado','archivado']),
--                             porque un torneo sin terminar todavía no tiene
--                             puestos: el que va en semis puede salir campeón
--                             o cuarto.
--   · categoria = NULL      → cae en el grupo "Sin categoría", una tabla
--                             aparte que no es el SUB13.
--   · genero = NULL         → y este es el más silencioso de los cuatro. El
--                             ranking agrupa por la clave `categoria||genero`,
--                             y el saldo de papel de la 189 se cargó como
--                             'mixto'. Con el género vacío la clave sería
--                             'SUB13||' contra 'SUB13||mixto': dos tablas SUB13
--                             distintas, una con el papel y otra con el torneo,
--                             y nadie sumando con nadie.
--
-- El origen es simple: el torneo se creó desde /torneos, que por defecto crea
-- `tipo = 'externo'` y no pide categoría ni género (ver crearTorneo en
-- src/app/actions/torneos.ts). El módulo que sí los exige es /torneos-internos.
-- Después de esta migración el torneo se ve ahí, no en /torneos.
--
-- ── Por qué se corrige el torneo y no se carga un saldo ───────────────────
-- La tentación era meter los 8 puntajes en `ranking_saldo_inicial`, como se
-- hizo con el ranking de papel. Sería un error: el saldo existe para puntos que
-- NO se pueden recalcular porque no existe el partido del que salieron. Acá los
-- partidos existen. Si se cargara el saldo y mañana alguien finalizara el
-- torneo desde la app —que es lo natural—, los mismos puntos entrarían dos
-- veces y nadie tendría cómo darse cuenta.
--
-- Corrigiendo la fila, los puntos los calcula el motor de siempre
-- (puestosDelTorneo) y quedan atados a la llave que los produjo.
--
-- ── Los puntos que reparte ────────────────────────────────────────────────
-- Por puesto final, con la tabla vigente (100/90/80/60/9):
--   100  Tomas Ignacio Lopez Garrido        1°     (le ganó la final a Diego)
--    90  Diego Nicolás Ramírez Navarrete    2°
--    80  Francisco Javier Rivas Pino        3-4
--    80  Vicente Rojas Rojas                3-4
--    60  Julieta Ivonne Amigo León          5-8
--    60  Vicente Ignacio González Meza      5-8
--     9  Augusto Esteban Espina Oyarzun     fase de grupos
--     9  Alexander Calderón Diaz            fase de grupos
--
-- Esta migración no escribe ninguno de esos números: salen solos de los
-- partidos. Están acá para poder contrastarlos con la pantalla después.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('191_ranking_sub13_agosto_2026');

-- ── 1. Que el torneo esté como lo dejamos ─────────────────────────────────
-- Si alguien ya lo finalizó o lo corrigió a mano desde la app entremedio, esta
-- migración no tiene nada que hacer y es mejor que avise en vez de pisar un
-- estado más nuevo con uno viejo.
DO $$
DECLARE t record;
BEGIN
  SELECT id, nombre, tipo, estado, categoria, genero INTO t
  FROM public.torneos
  WHERE id = '51fdf328-bc66-44b1-8708-276c3a906e4b'
    AND club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No existe el torneo RANKING SUB 13 en Buin. Revisar el id antes de seguir.';
  END IF;
  IF t.tipo <> 'externo' OR t.estado <> 'en_curso' THEN
    RAISE EXCEPTION 'El torneo ya no está como se esperaba (tipo=%, estado=%). Alguien lo tocó: revisar a mano.', t.tipo, t.estado;
  END IF;
END $$;

-- Y que la llave esté completa: sin la final no hay campeón, y sin campeón el
-- torneo no reparte los 100. Finalizar un torneo con la llave a medio andar
-- congelaría puestos que todavía no se jugaron.
DO $$
DECLARE finales int;
BEGIN
  SELECT count(*) INTO finales
  FROM public.torneo_partidos
  WHERE torneo_id = '51fdf328-bc66-44b1-8708-276c3a906e4b'
    AND fase = 'final' AND ganador IS NOT NULL;
  IF finales <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente 1 final con ganador y hay %.', finales;
  END IF;
END $$;

-- ── 2. La corrección ──────────────────────────────────────────────────────
-- `genero = 'mixto'` no es una decisión de esta migración: es lo que ya dice la
-- 189 sobre las cinco categorías del papel —"Las cinco son mixtas, confirmado
-- por la asociación"— y además el cuadro tiene a Julieta adentro.
--
-- La fecha de cierre en hora de Chile. `current_date` daría el día UTC, que
-- después de las 21:00 en Chile ya es mañana.
UPDATE public.torneos SET
  tipo          = 'interno',
  estado        = 'finalizado',
  fase          = 'finalizado',
  categoria     = 'SUB13',
  genero        = 'mixto',
  fecha_fin     = COALESCE(fecha_inicio, (now() AT TIME ZONE 'America/Santiago')::date),
  campeon_id    = (SELECT id FROM public.jugadores
                   WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
                     AND replace(upper(rut), '.', '') = '24194451-4'),   -- Tomas Ignacio Lopez Garrido
  subcampeon_id = (SELECT id FROM public.jugadores
                   WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
                     AND replace(upper(rut), '.', '') = '24182702-K')    -- Diego Nicolás Ramírez Navarrete
WHERE id = '51fdf328-bc66-44b1-8708-276c3a906e4b'
  AND club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';

-- Campeón y subcampeón se buscan por RUT, y si un RUT no calzara el UPDATE
-- dejaría la columna en NULL sin quejarse. Que no pase.
DO $$
DECLARE t record;
BEGIN
  SELECT campeon_id, subcampeon_id, categoria, genero INTO t
  FROM public.torneos WHERE id = '51fdf328-bc66-44b1-8708-276c3a906e4b';
  IF t.campeon_id IS NULL OR t.subcampeon_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver campeón y/o subcampeón por RUT.';
  END IF;
  IF t.categoria <> 'SUB13' OR t.genero <> 'mixto' THEN
    RAISE EXCEPTION 'La categoría/género no quedaron como se pedía (%, %).', t.categoria, t.genero;
  END IF;
END $$;

-- ── 3. Que la categoría exista en la lista del club ───────────────────────
-- La creó la 189, pero si esa migración no se hubiera corrido en esta base el
-- torneo quedaría apuntando a una categoría que no está en el selector.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.categorias_personalizadas
    WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND nombre = 'SUB13'
  ) THEN
    RAISE EXCEPTION 'Falta la categoría SUB13 del club: correr antes la 189.';
  END IF;
END $$;

-- ── 4. Que el saldo de papel siga contando ────────────────────────────────
-- El ranking descarta el saldo si es anterior al último "Reiniciar Ranking".
-- Si alguien reinicia después de esta migración, el SUB13 queda solo con los
-- puntos de este torneo y sin los 1.226 del papel — y esto lo deja avisado
-- ahora, no dentro de tres meses.
DO $$
DECLARE reinicio timestamptz;
DECLARE saldo_ts timestamptz;
BEGIN
  SELECT ranking_reiniciado_en INTO reinicio
  FROM public.clubes WHERE id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc';
  SELECT min(creado_en) INTO saldo_ts
  FROM public.ranking_saldo_inicial
  WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' AND categoria = 'SUB13';

  IF saldo_ts IS NULL THEN
    RAISE EXCEPTION 'No hay saldo SUB13 cargado: correr antes la 189.';
  END IF;
  IF reinicio IS NOT NULL AND saldo_ts <= reinicio THEN
    RAISE EXCEPTION 'El saldo del papel quedó antes del último reinicio (%): el SUB13 saldría sin los puntos del papel.', reinicio;
  END IF;
END $$;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) La fila del torneo, ya corregida.
SELECT nombre, tipo, estado, fase, categoria, genero, fecha_fin,
       (SELECT nombre FROM public.jugadores WHERE id = t.campeon_id)    AS campeon,
       (SELECT nombre FROM public.jugadores WHERE id = t.subcampeon_id) AS subcampeon
FROM public.torneos t
WHERE t.id = '51fdf328-bc66-44b1-8708-276c3a906e4b';

-- 2) El SUB13 como debería verse en pantalla: papel + este torneo.
--    Esperado arriba: Rivas, Amigo y Meirelles empatados en 240, González 230.
WITH del_torneo AS (
  SELECT * FROM (VALUES
    ('24194451-4', 100), ('24182702-K',  90), ('24370009-4', 80), ('24231149-3', 80),
    ('24663761-K',  60), ('24282913-1',  60), ('24841079-5',  9), ('24459917-6',  9)
  ) AS v(rut, puntos)
)
SELECT j.nombre,
       COALESCE(s.puntos, 0)  AS papel,
       COALESCE(dt.puntos, 0) AS torneo,
       COALESCE(s.puntos, 0) + COALESCE(dt.puntos, 0) AS total
FROM public.jugadores j
LEFT JOIN public.ranking_saldo_inicial s
       ON s.jugador_id = j.id AND s.categoria = 'SUB13'
LEFT JOIN del_torneo dt
       ON replace(upper(j.rut), '.', '') = dt.rut
WHERE j.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND (s.puntos IS NOT NULL OR dt.puntos IS NOT NULL)
ORDER BY total DESC, j.nombre;
