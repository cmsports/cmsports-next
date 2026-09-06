-- ════════════════════════════════════════════════════════════════════════
-- DEMO: encender los módulos de Spinhouse y llenarlos con datos plausibles
--
-- Para que Cristhian vea las pantallas funcionando en vez de vacías. **NO es
-- una migración**: no toca el esquema, no lleva `_migracion_nueva` y no se
-- registra en `_migraciones_aplicadas`. Es un seed, y se puede correr, borrar
-- y volver a correr.
--
-- ── Antes de pegar nada ────────────────────────────────────────────────
--
-- Requiere las migraciones **257** y **258** ya corridas. El PASO 0 lo
-- comprueba y te dice si falta alguna.
--
-- ── Lo que este archivo NO hace, y es a propósito ──────────────────────
--
-- · **No toca a Buin.** Cada sentencia filtra por el club de Spinhouse. Si
--   alguna te devuelve filas de otro club, parala ahí.
-- · **No crea ni borra jugadores.** Usa los que ya están.
-- · **No enciende el bloqueo automático por morosidad.** Los umbrales de aviso
--   y bloqueo quedan puestos, pero eso solo hace que la pantalla de retención
--   MUESTRE a quién le tocaría. Nada bloquea a nadie: la marcha en seco de un
--   mes que pide el plan sigue siendo obligatoria antes de encender nada.
-- · **No manda un solo WhatsApp ni un correo.**
--
-- ⚠️ Los movimientos del PASO 7 se insertan **directo**, sin pasar por
-- `registrar_movimiento_financiero_atomico`. Es la única regla del proyecto
-- que este archivo rompe, y se rompe a conciencia: el RPC saca el club y el
-- usuario de la sesión con `_finanzas_admin_contexto()`, y en el SQL Editor no
-- hay sesión de aplicación. La consecuencia es que estos movimientos **no
-- dejan rastro en `audit_log`**, así que llevan `[DEMO]` en la descripción y
-- el PASO 10 los borra por ahí. No uses este atajo para plata de verdad.
--
-- ⚠️ CORRÉ LOS PASOS DE A UNO. El 0 te dice qué hay antes de tocar nada.
-- ════════════════════════════════════════════════════════════════════════


-- ══ PASO 0 ══ Qué hay hoy. Mirá esto ANTES de seguir. ═══════════════════

SELECT c.nombre,
       c.id AS club_id,
       (SELECT count(*) FROM public.jugadores      j WHERE j.club_id = c.id AND j.estado = 'activo') AS jugadores_activos,
       (SELECT count(*) FROM public.bloques_horario b WHERE b.club_id = c.id AND b.activo)           AS bloques,
       (SELECT count(*) FROM public.profesores      p WHERE p.club_id = c.id AND p.activo)           AS profesores,
       c.modulos_habilitados
FROM   public.clubes c
WHERE  c.nombre ILIKE '%spinhouse%';

-- Y que estén las dos migraciones nuevas. Las dos tienen que aparecer:
SELECT nombre FROM public._migraciones_aplicadas
WHERE  nombre IN ('257_tipos_de_clase_y_auxiliar', '258_categorias_propias_en_el_rpc')
ORDER  BY nombre;


-- ══ PASO 1 ══ Encender los módulos ══════════════════════════════════════
--
-- `array_append` sobre lo que ya tiene, nunca una lista escrita a mano:
-- asignar `modulos_habilitados = ARRAY[...]` le apagaría los que ya usa.

DO $$
DECLARE v_modulo text;
BEGIN
  FOREACH v_modulo IN ARRAY ARRAY[
    'mesas',        -- el tablero de mesas y el cupo derivado
    'config_club',  -- el panel de configuración por club
    'planes',       -- tarifas de mensualidad
    'retencion',    -- morosidad y alertas, EN SECO
    'tecnico',      -- perfil técnico y plantillas de sesión
    'tipos_clase'   -- por si la 257 se corrió antes de que el club existiera
  ] LOOP
    UPDATE public.clubes
    SET    modulos_habilitados = array_append(modulos_habilitados, v_modulo)
    WHERE  nombre ILIKE '%spinhouse%'
      AND  NOT (v_modulo = ANY(COALESCE(modulos_habilitados, ARRAY[]::text[])));
  END LOOP;
END;
$$;


-- ══ PASO 2 ══ La configuración del club ═════════════════════════════════
--
-- Estos son los valores que el club declaró en el formulario. Los de
-- morosidad hacen que la pantalla de retención tenga algo que mostrar; NO
-- bloquean a nadie, porque nada ejecuta el bloqueo todavía.

INSERT INTO public.club_config (club_id, clave, valor)
SELECT c.id, v.clave, v.valor::jsonb
FROM   public.clubes c,
       (VALUES
         ('cupos.modo',                '"por_mesas"'),
         ('cupos.por_mesa_grupal',     '4'),
         ('cupos.por_mesa_particular', '2'),
         ('mensualidad.modo',          '"por_plan"'),
         ('morosidad.dias_aviso',      '15'),
         ('morosidad.dias_bloqueo',    '30'),
         ('retencion.faltas_alerta',   '3'),
         ('retencion.dias_inactivo',   '60')
       ) AS v(clave, valor)
WHERE  c.nombre ILIKE '%spinhouse%'
ON CONFLICT (club_id, clave) DO UPDATE SET valor = EXCLUDED.valor;


-- ══ PASO 3 ══ Las mesas de la sede ══════════════════════════════════════
--
-- Ocho es un número plausible para una sede única; cuando Cristhian diga el
-- real, se cambia desde /horario → Mesas sin volver a tocar SQL.
--
-- ⚠️ La sede sale de los BLOQUES, no escrita a mano. `sede_mesas.sede` se cruza
-- con `bloques_horario.sede` por igualdad de texto: si acá se pusiera
-- 'spinhouse' y los bloques dijeran otra cosa, cada bloque quedaría con cupo 0
-- y la tarjeta de ocupación se vería vacía sin dar ningún error.

INSERT INTO public.sede_mesas (club_id, sede, cantidad, notas)
SELECT DISTINCT b.club_id, b.sede, 8, 'Dato de demostración — confirmar con el club'
FROM   public.bloques_horario b
JOIN   public.clubes c ON c.id = b.club_id
WHERE  c.nombre ILIKE '%spinhouse%' AND b.activo AND b.sede IS NOT NULL
ON CONFLICT (club_id, sede) DO UPDATE
  SET cantidad = EXCLUDED.cantidad, actualizado_en = now();


-- ══ PASO 4 ══ Tipo de clase en cada bloque ══════════════════════════════
--
-- Reparte los tipos por hora, que es como se reparten de verdad: los menores
-- temprano, los adultos y el competitivo después. Determinista —sale del
-- `row_number()` y no de random()— así que correrlo dos veces da lo mismo y
-- se le puede explicar a Cristhian por qué cada bloque quedó como quedó.

WITH ordenados AS (
  SELECT b.id,
         row_number() OVER (ORDER BY b.dia_semana, b.hora_inicio, b.nombre) AS n
  FROM   public.bloques_horario b
  JOIN   public.clubes c ON c.id = b.club_id
  WHERE  c.nombre ILIKE '%spinhouse%' AND b.activo
)
UPDATE public.bloques_horario b
SET    tipo_clase = CASE (o.n % 5)
                      WHEN 0 THEN 'particular'
                      WHEN 1 THEN 'grupal'
                      WHEN 2 THEN 'competitivo'
                      WHEN 3 THEN 'adultos'
                      ELSE        'paralimpico'
                    END,
       -- Solo los particulares se cobran aparte. Es lo que dijo el club.
       se_cobra_aparte = ((o.n % 5) = 0)
FROM   ordenados o
WHERE  b.id = o.id;


-- ══ PASO 5 ══ Un auxiliar en los bloques que tienen dos profes ══════════
--
-- Al segundo profesor de cada bloque —por orden de nombre— se le pone rol
-- 'auxiliar'. Los bloques con un solo profe quedan como están.

WITH numerados AS (
  SELECT bp.id,
         row_number() OVER (PARTITION BY bp.bloque_id ORDER BY p.nombre) AS puesto
  FROM   public.bloque_profesores bp
  JOIN   public.profesores p     ON p.id = bp.profesor_id
  JOIN   public.bloques_horario b ON b.id = bp.bloque_id
  JOIN   public.clubes c          ON c.id = b.club_id
  WHERE  c.nombre ILIKE '%spinhouse%' AND bp.vigente_hasta IS NULL
)
UPDATE public.bloque_profesores bp
SET    rol = 'auxiliar'
FROM   numerados n
WHERE  bp.id = n.id AND n.puesto > 1;


-- ══ PASO 6 ══ Planes de mensualidad ═════════════════════════════════════
--
-- Frecuencia semanal × tipo de clase → monto, que es como cobra el club.
-- Los montos son de demostración: se editan desde /finanzas → Planes.

INSERT INTO public.planes_club (club_id, nombre, frecuencia_semanal, tipo_clase, monto, vigente_desde, activo)
SELECT c.id, v.nombre, v.frec, v.tipo, v.monto, date_trunc('year', now())::date, true
FROM   public.clubes c,
       (VALUES
         ('Grupal 1 vez por semana',  1, 'grupal',      28000),
         ('Grupal 2 veces por semana', 2, 'grupal',     45000),
         ('Grupal 3 veces por semana', 3, 'grupal',     58000),
         ('Competitivo (libre)',       5, 'competitivo', 75000),
         ('Escuela de adultos',        2, 'adultos',    42000),
         ('Particular por sesión',     1, 'particular', 20000)
       ) AS v(nombre, frec, tipo, monto)
WHERE  c.nombre ILIKE '%spinhouse%'
  AND  NOT EXISTS (
    SELECT 1 FROM public.planes_club pc
    WHERE pc.club_id = c.id AND pc.nombre = v.nombre
  );

-- Y repartir los planes entre los jugadores activos, para que Mensualidades y
-- Estado de Cuenta tengan qué mostrar. Solo a los que NO tienen plan: si
-- alguno ya fue asignado a mano, no se pisa.
WITH activos AS (
  SELECT j.id, row_number() OVER (ORDER BY j.nombre) AS n
  FROM   public.jugadores j
  JOIN   public.clubes c ON c.id = j.club_id
  WHERE  c.nombre ILIKE '%spinhouse%'
    AND  j.estado = 'activo'
    AND  COALESCE(j.es_externo, false) = false
    AND  j.plan_id IS NULL
),
catalogo AS (
  SELECT pc.id, row_number() OVER (ORDER BY pc.monto) - 1 AS k,
         count(*) OVER () AS total
  FROM   public.planes_club pc
  JOIN   public.clubes c ON c.id = pc.club_id
  WHERE  c.nombre ILIKE '%spinhouse%' AND pc.activo
)
UPDATE public.jugadores j
SET    plan_id = cat.id
FROM   activos a
JOIN   catalogo cat ON cat.k = (a.n % cat.total)
WHERE  j.id = a.id;


-- ══ PASO 7 ══ Movimientos con las categorías propias ════════════════════
--
-- Para que la tarjeta "Ingresos por línea" del dashboard tenga más de una
-- barra. Van con `[DEMO]` en la descripción: es lo que el PASO 10 usa para
-- borrarlos sin tocar ningún movimiento real.
--
-- Fechas dentro del mes en curso, porque el dashboard resume el mes actual.

INSERT INTO public.movimientos (club_id, tipo, categoria, descripcion, monto, fecha, registrado_por_nombre)
SELECT c.id, v.tipo, v.categoria, '[DEMO] ' || v.detalle, v.monto,
       LEAST(
         date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date + v.dia,
         (now() AT TIME ZONE 'America/Santiago')::date
       ),
       'Seed de demostración'
FROM   public.clubes c,
       (VALUES
         ('ingreso', 'clase_particular', 'Clases particulares de la semana', 120000, 2),
         ('ingreso', 'clase_particular', 'Particulares — bloque del jueves',  80000, 9),
         ('ingreso', 'arriendo_mesa',    'Arriendo de mesas · sábado',        45000, 5),
         ('ingreso', 'arriendo_mesa',    'Arriendo de mesas · empresa',       60000, 12),
         ('ingreso', 'venta_articulos',  'Venta de gomas y pelotas',          38000, 7),
         ('ingreso', 'auspicio',         'Auspicio local',                   150000, 3),
         ('gasto',   'premio_liga',      'Premios fecha de liga',             55000, 8),
         ('gasto',   'marketing',        'Pauta en redes sociales',           40000, 4)
       ) AS v(tipo, categoria, detalle, monto, dia)
WHERE  c.nombre ILIKE '%spinhouse%'
  AND  NOT EXISTS (
    SELECT 1 FROM public.movimientos m
    WHERE m.club_id = c.id AND m.descripcion = '[DEMO] ' || v.detalle
  );


-- ══ PASO 8 ══ Un arriendo que compite con las clases ════════════════════
--
-- Dos mesas arrendadas hoy de 19:00 a 20:00. Es lo que hace visible en el
-- tablero de mesas que el arriendo y la clase pelean por la misma sala.

-- La sede, otra vez, sale de los bloques: un arriendo en una sede que ningún
-- bloque usa no compite con nada y el tablero no lo mostraría.

INSERT INTO public.mesa_arriendos (club_id, sede, fecha, hora_inicio, hora_fin, mesas, arrendatario)
SELECT c.id, sm.sede, (now() AT TIME ZONE 'America/Santiago')::date,
       '19:00', '20:00', 2, '[DEMO] Grupo de empresa'
FROM   public.clubes c
JOIN   LATERAL (
         SELECT s.sede FROM public.sede_mesas s
         WHERE s.club_id = c.id ORDER BY s.sede LIMIT 1
       ) sm ON true
WHERE  c.nombre ILIKE '%spinhouse%'
  AND  NOT EXISTS (
    SELECT 1 FROM public.mesa_arriendos ma
    WHERE ma.club_id = c.id
      AND ma.fecha = (now() AT TIME ZONE 'America/Santiago')::date
      AND ma.arrendatario = '[DEMO] Grupo de empresa'
  );


-- ══ PASO 9 ══ Tres alumnos con tres faltas seguidas ═════════════════════
--
-- Para que la alerta del dashboard del profe tenga a quién mostrar.
--
-- ⚠️ El orden importa y no es cosmético. `faltasSeguidas` cuenta desde la
-- marca MÁS RECIENTE hacia atrás y se detiene en el primer 'presente'. Así
-- que las tres ausencias tienen que ser las últimas tres fechas, y antes va
-- un 'presente' — que además es lo que hace la demo creíble: alguien que
-- venía y dejó de venir, no alguien que nunca vino.
--
-- ⚠️ Y los tres alumnos NO son los primeros del padrón: son tres de los que
-- entrenan el día que el profe va a estar mirando. `AlertaFaltas` solo alerta
-- sobre los alumnos de los bloques de HOY —a propósito: hoy es cuando puede
-- hacer algo, y el entrenador ve sus grupos, no el padrón—. Tres alumnos
-- elegidos por orden alfabético caen casi seguro en otro día y la alerta no
-- aparece nunca, sin que nada avise por qué.
--
-- Si hoy es sábado o domingo se apunta al lunes: el fin de semana el dashboard
-- del profe no muestra bloques y no hay dónde ver la alerta.

WITH dia_objetivo AS (
  SELECT CASE extract(isodow FROM (now() AT TIME ZONE 'America/Santiago')::date)
           WHEN 2 THEN 'mar' WHEN 3 THEN 'mie' WHEN 4 THEN 'jue' WHEN 5 THEN 'vie'
           ELSE 'lun'
         END AS dia
),
tres AS (
  SELECT DISTINCT ON (j.nombre) j.id, j.club_id, j.nombre
  FROM   public.jugadores j
  JOIN   public.clubes c  ON c.id = j.club_id
  JOIN   public.bloque_jugadores bj ON bj.jugador_id = j.id AND bj.vigente_hasta IS NULL
  JOIN   public.bloques_horario  b  ON b.id = bj.bloque_id AND b.activo
                                   AND b.dia_semana = (SELECT dia FROM dia_objetivo)
  WHERE  c.nombre ILIKE '%spinhouse%'
    AND  j.estado = 'activo'
    AND  COALESCE(j.es_externo, false) = false
  ORDER  BY j.nombre
  LIMIT  3
),
fechas AS (
  -- 4 marcas: la más vieja presente, las tres últimas ausentes.
  SELECT * FROM (VALUES
    (28, 'presente'),
    (21, 'ausente'),
    (14, 'ausente'),
    (7,  'ausente')
  ) AS f(dias_atras, estado)
)
INSERT INTO public.asistencia (club_id, jugador_id, fecha, estado, metodo)
SELECT t.club_id, t.id,
       (now() AT TIME ZONE 'America/Santiago')::date - f.dias_atras,
       f.estado, 'manual'
FROM   tres t CROSS JOIN fechas f
WHERE  NOT EXISTS (
  SELECT 1 FROM public.asistencia a
  WHERE a.jugador_id = t.id
    AND a.fecha = (now() AT TIME ZONE 'America/Santiago')::date - f.dias_atras
);
-- `registrado_por` NO se escribe: tiene la FK rota y rompió las tres vías de
-- registro. Es un bug conocido del proyecto.
--
-- ⚠️ Y `metodo` va en 'manual', no en 'demo'. La migración 037 le puso un CHECK
-- a esa columna —solo NULL, 'manual', 'qr', 'autoregistro', 'rut'— así que
-- 'demo' voltea el INSERT entero. Eso deja a estas filas SIN una marca propia
-- que las distinga de la asistencia real, y por eso el DESHACER las borra por
-- alumno y fecha, con una consulta de revisión obligatoria antes. Está escrito
-- allá abajo con todas sus letras.


-- ══ PASO 10 ══ Una baja y un reingreso, para la tarjeta del dashboard ═══
--
-- La tarjeta de altas y bajas mide el mes en curso. Sin esto muestra tres
-- ceros, que es correcto pero no se entiende hasta que pasa algo.
--
-- Al 4.º alumno por nombre se le cierra su inscripción a mitad de mes: como
-- no le queda ninguna vigente, cuenta como baja.

WITH cuarto AS (
  SELECT j.id
  FROM   public.jugadores j
  JOIN   public.clubes c ON c.id = j.club_id
  WHERE  c.nombre ILIKE '%spinhouse%' AND j.estado = 'activo'
  ORDER  BY j.nombre OFFSET 3 LIMIT 1
)
UPDATE public.bloque_jugadores bj
SET    vigente_hasta = date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date + 9
FROM   cuarto
WHERE  bj.jugador_id = cuarto.id AND bj.vigente_hasta IS NULL;

-- Y el reingreso: al 5.º se le cierra la inscripción ANTES de que empezara el
-- mes y se le abre una nueva adentro. Los dos pasos son necesarios y el orden
-- importa: `reingreso` es "abrió inscripción en el mes, ya tenía historial y
-- NO venía vigente de antes". Si solo se le abriera una nueva sin cerrar la
-- vieja, vendría vigente de antes y no contaría como nada.

WITH quinto AS (
  SELECT j.id
  FROM   public.jugadores j
  JOIN   public.clubes c ON c.id = j.club_id
  WHERE  c.nombre ILIKE '%spinhouse%' AND j.estado = 'activo'
  ORDER  BY j.nombre OFFSET 4 LIMIT 1
),
-- El bloque al que va a volver: uno de los que ya tenía. Se guarda ANTES de
-- cerrar, porque después de cerrar no queda ninguno abierto que mirar.
suyo AS (
  SELECT bj.bloque_id
  FROM   public.bloque_jugadores bj, quinto
  WHERE  bj.jugador_id = quinto.id AND bj.vigente_hasta IS NULL
  ORDER  BY bj.vigente_desde LIMIT 1
),
cerrar AS (
  UPDATE public.bloque_jugadores bj
  SET    vigente_hasta = date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date - 5
  FROM   quinto
  WHERE  bj.jugador_id = quinto.id AND bj.vigente_hasta IS NULL
  RETURNING 1
)
INSERT INTO public.bloque_jugadores (bloque_id, jugador_id, vigente_desde)
SELECT suyo.bloque_id, quinto.id,
       date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date + 4
FROM   quinto, suyo
WHERE  EXISTS (SELECT 1 FROM cerrar);

-- ⚠️ El **alta** no se simula, y es a propósito: un alta es "su primera
-- inscripción del club empieza este mes", y fabricarla obligaría a reescribir
-- el `vigente_desde` de un alumno que entró de verdad hace meses — o sea, a
-- borrar historia real para que un número quede lindo. Es mejor demo mostrarlo
-- en vivo: que Cristhian inscriba a alguien por el link y la tarjeta pase a
-- "+1 entraron" delante de él.


-- ══ VERIFICACIÓN ════════════════════════════════════════════════════════

-- Los módulos quedaron encendidos:
SELECT nombre, modulos_habilitados FROM public.clubes WHERE nombre ILIKE '%spinhouse%';

-- Los tipos de clase repartidos:
SELECT b.tipo_clase, count(*), bool_or(b.se_cobra_aparte) AS alguno_se_cobra_aparte
FROM   public.bloques_horario b JOIN public.clubes c ON c.id = b.club_id
WHERE  c.nombre ILIKE '%spinhouse%' AND b.activo
GROUP  BY b.tipo_clase ORDER BY b.tipo_clase;

-- ⚠️ QUÉ DÍA ABRIR EL DASHBOARD DEL PROFE. La alerta de faltas solo mira a los
-- alumnos de los bloques de ESE día; estos tres son los que quedaron cargados:
SELECT CASE extract(isodow FROM (now() AT TIME ZONE 'America/Santiago')::date)
         WHEN 2 THEN 'mar' WHEN 3 THEN 'mie' WHEN 4 THEN 'jue' WHEN 5 THEN 'vie'
         ELSE 'lun' END                                   AS abrir_el_dia,
       string_agg(DISTINCT j.nombre, ', ' ORDER BY j.nombre) AS alumnos_con_3_faltas
FROM   public.asistencia a
JOIN   public.jugadores j ON j.id = a.jugador_id
JOIN   public.clubes c    ON c.id = j.club_id
WHERE  c.nombre ILIKE '%spinhouse%' AND a.estado = 'ausente'
  AND  a.fecha IN (
         (now() AT TIME ZONE 'America/Santiago')::date - 21,
         (now() AT TIME ZONE 'America/Santiago')::date - 14,
         (now() AT TIME ZONE 'America/Santiago')::date - 7
       );

-- Y la tarjeta de altas y bajas del mes. Esperado: 0 entraron, 1 volvió,
-- 1 o 2 se fueron (2 si el reingreso cayó en el mismo alumno que la baja no es
-- posible —son el 4.º y el 5.º—, así que lo normal es 1).
WITH mes AS (
  SELECT date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date AS desde,
         (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)
          + interval '1 month - 1 day')::date AS hasta
)
SELECT count(*) FILTER (WHERE NOT venia AND empezo AND primera >= (SELECT desde FROM mes)) AS entraron,
       count(*) FILTER (WHERE NOT venia AND empezo AND primera <  (SELECT desde FROM mes)) AS volvieron,
       count(*) FILTER (WHERE (venia OR empezo) AND NOT sigue)                             AS se_fueron
FROM (
  SELECT bj.jugador_id,
         min(bj.vigente_desde) AS primera,
         bool_or(bj.vigente_desde <  (SELECT desde FROM mes)
             AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= (SELECT desde FROM mes))) AS venia,
         bool_or(bj.vigente_desde BETWEEN (SELECT desde FROM mes) AND (SELECT hasta FROM mes)) AS empezo,
         bool_or(bj.vigente_desde <= (SELECT hasta FROM mes)
             AND (bj.vigente_hasta IS NULL OR bj.vigente_hasta >= (SELECT hasta FROM mes)))  AS sigue
  FROM   public.bloque_jugadores bj
  JOIN   public.jugadores j ON j.id = bj.jugador_id
  JOIN   public.clubes c    ON c.id = j.club_id
  WHERE  c.nombre ILIKE '%spinhouse%'
  GROUP  BY bj.jugador_id
) x;

-- Los ingresos por línea del mes (lo que va a mostrar la tarjeta):
SELECT m.categoria, sum(m.monto) AS total
FROM   public.movimientos m JOIN public.clubes c ON c.id = m.club_id
WHERE  c.nombre ILIKE '%spinhouse%' AND m.tipo = 'ingreso'
  AND  m.fecha >= date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)::date
GROUP  BY m.categoria ORDER BY total DESC;

-- ⚠️ Y LA IMPORTANTE: que Buin no se movió. Tiene que dar 0 en las cuatro.
SELECT
  (SELECT count(*) FROM public.movimientos  m WHERE m.descripcion LIKE '[DEMO]%'
     AND m.club_id <> (SELECT id FROM public.clubes WHERE nombre ILIKE '%spinhouse%')) AS movimientos_ajenos,
  (SELECT count(*) FROM public.bloques_horario b WHERE b.tipo_clase IS NOT NULL
     AND b.club_id <> (SELECT id FROM public.clubes WHERE nombre ILIKE '%spinhouse%')) AS bloques_ajenos,
  (SELECT count(*) FROM public.club_config cc
     WHERE cc.club_id <> (SELECT id FROM public.clubes WHERE nombre ILIKE '%spinhouse%')) AS config_ajena,
  (SELECT count(*) FROM public.sede_mesas sm
     WHERE sm.club_id <> (SELECT id FROM public.clubes WHERE nombre ILIKE '%spinhouse%')) AS mesas_ajenas;


-- ════════════════════════════════════════════════════════════════════════
-- DESHACER — deja todo como estaba antes de este archivo
--
-- Corré esto entero si la demo salió mal o cuando lleguen los datos reales.
-- No borra jugadores, bloques ni profesores: esos ya existían.
-- ════════════════════════════════════════════════════════════════════════
/*
BEGIN;

-- Los movimientos de demostración, por su marca. Ningún movimiento real
-- empieza con '[DEMO] '.
DELETE FROM public.movimientos m
USING  public.clubes c
WHERE  c.id = m.club_id AND c.nombre ILIKE '%spinhouse%'
  AND  m.descripcion LIKE '[DEMO]%';

DELETE FROM public.mesa_arriendos ma
USING  public.clubes c
WHERE  c.id = ma.club_id AND c.nombre ILIKE '%spinhouse%'
  AND  ma.arrendatario LIKE '[DEMO]%';

-- ⚠️ ESTA ES LA ÚNICA SENTENCIA DEL DESHACER QUE NO ES SEGURA A CIEGAS.
--
-- Las marcas del PASO 9 no llevan una marca propia —el CHECK de la 037 no deja
-- inventar un `metodo`—, así que se borran por alumno y fecha. Si el club ya
-- tomó asistencia de verdad, ESAS FILAS SON REALES Y ESTO LAS BORRA.
--
-- Mirá primero qué va a caer. Si son 12 filas o menos y las cuatro fechas están
-- separadas por 7 días exactos, son las del seed:
--
--   SELECT j.nombre, a.fecha, a.estado
--   FROM   public.asistencia a
--   JOIN   public.jugadores j ON j.id = a.jugador_id
--   JOIN   public.clubes c    ON c.id = j.club_id
--   WHERE  c.nombre ILIKE '%spinhouse%'
--     AND  a.fecha IN ((now() AT TIME ZONE 'America/Santiago')::date - 28,
--                      (now() AT TIME ZONE 'America/Santiago')::date - 21,
--                      (now() AT TIME ZONE 'America/Santiago')::date - 14,
--                      (now() AT TIME ZONE 'America/Santiago')::date - 7)
--   ORDER  BY j.nombre, a.fecha;
--
-- Y ojo con el calendario: las fechas son relativas a HOY, así que el deshacer
-- borra lo correcto solo si lo corrés el mismo día que corriste el seed. Un día
-- después apunta a otras cuatro fechas.

DELETE FROM public.asistencia a
USING  public.clubes c
WHERE  c.id = a.club_id AND c.nombre ILIKE '%spinhouse%'
  AND  a.fecha IN ((now() AT TIME ZONE 'America/Santiago')::date - 28,
                   (now() AT TIME ZONE 'America/Santiago')::date - 21,
                   (now() AT TIME ZONE 'America/Santiago')::date - 14,
                   (now() AT TIME ZONE 'America/Santiago')::date - 7);

UPDATE public.jugadores j SET plan_id = NULL
FROM   public.clubes c WHERE c.id = j.club_id AND c.nombre ILIKE '%spinhouse%';

DELETE FROM public.planes_club pc
USING  public.clubes c WHERE c.id = pc.club_id AND c.nombre ILIKE '%spinhouse%';

UPDATE public.bloques_horario b
SET    tipo_clase = NULL, se_cobra_aparte = false, plan_id = NULL
FROM   public.clubes c WHERE c.id = b.club_id AND c.nombre ILIKE '%spinhouse%';

UPDATE public.bloque_profesores bp SET rol = 'principal'
FROM   public.bloques_horario b, public.clubes c
WHERE  b.id = bp.bloque_id AND c.id = b.club_id AND c.nombre ILIKE '%spinhouse%';

DELETE FROM public.sede_mesas sm
USING  public.clubes c WHERE c.id = sm.club_id AND c.nombre ILIKE '%spinhouse%';

DELETE FROM public.club_config cc
USING  public.clubes c WHERE c.id = cc.club_id AND c.nombre ILIKE '%spinhouse%';

-- Los módulos vuelven a apagarse.
UPDATE public.clubes
SET    modulos_habilitados = ARRAY(
         SELECT m FROM unnest(modulos_habilitados) m
         WHERE m <> ALL (ARRAY['mesas','config_club','planes','retencion','tecnico','tipos_clase'])
       )
WHERE  nombre ILIKE '%spinhouse%';

COMMIT;

-- ⚠️ El PASO 10 (la baja y el reingreso) NO se revierte acá: reabrir esas
-- inscripciones a ciegas podría reabrir alguna que el club cerró de verdad.
-- La fila NUEVA del reingreso sí se puede borrar sin riesgo —la creó este
-- archivo— y se reconoce por su `vigente_desde` = día 5 del mes en curso.
-- Si querés deshacerlo, mirá primero cuáles fueron:
--
--   SELECT bj.id, j.nombre, bj.vigente_hasta
--   FROM   public.bloque_jugadores bj
--   JOIN   public.jugadores j ON j.id = bj.jugador_id
--   JOIN   public.clubes c    ON c.id = j.club_id
--   WHERE  c.nombre ILIKE '%spinhouse%' AND bj.vigente_hasta IS NOT NULL
--   ORDER  BY bj.vigente_hasta DESC;
*/
