-- ────────────────────────────────────────────────────────────
-- Spinhouse deja de llamarse "Buin", y el alumno solo opina de SU profesor.
--
-- Este cambio afecta a: Spinhouse. La relajación del CHECK es de esquema y
-- aplica a todos, pero no cambia ninguna fila de otro club.
--
-- Cierra los hallazgos 6 y 9 de `docs/auditoria-spinhouse-clases.md`, y deja
-- por escrito las decisiones tomadas sobre los hallazgos 4 y 8.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;
SELECT _migracion_nueva('232_sede_spinhouse_y_feedback_a_su_profe');

-- ══ 1. La sede 'spinhouse' ════════════════════════════════════════════════
-- El CHECK original (migración 073) solo aceptaba 'buin' y 'paine', que son las
-- sedes de la Asociación Buin. Los bloques de Spinhouse habían quedado con
-- 'buin' y la pantalla los rotulaba "Buin (Aníbal Pinto 158)".
--
-- Ampliar un CHECK es compatible hacia atrás: ninguna fila existente deja de
-- cumplirlo. No se toca ninguna fila de otro club.
--
-- Esto NO es la solución de fondo. La buena es que las sedes sean configuración
-- de cada club (`docs/plan-aislamiento-clubes.md`, `club_config`), no una lista
-- en el código. Mientras eso no exista, esto es lo más chico que deja de
-- mentirle al usuario.
ALTER TABLE bloques_horario      DROP CONSTRAINT IF EXISTS bloques_horario_sede_check;
ALTER TABLE bloques_horario      ADD  CONSTRAINT bloques_horario_sede_check
  CHECK (sede IN ('buin', 'paine', 'spinhouse'));

ALTER TABLE grupos_entrenamiento DROP CONSTRAINT IF EXISTS grupos_entrenamiento_sede_check;
ALTER TABLE grupos_entrenamiento ADD  CONSTRAINT grupos_entrenamiento_sede_check
  CHECK (sede IN ('buin', 'paine', 'spinhouse'));

-- Y se mueven las filas de Spinhouse. El filtro por club_id es lo único que
-- separa esto de un desastre, así que va en las tres.
--
-- Las restricciones únicas que incluyen `sede`
-- —(club_id, sede, dia_semana, hora_inicio) y (club_id, sede, nombre)— se
-- respetan igual: todas las filas del club se mueven juntas, así que no hay dos
-- que colisionen.
UPDATE bloques_horario
SET sede = 'spinhouse'
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' AND sede <> 'spinhouse';

UPDATE grupos_entrenamiento
SET sede = 'spinhouse'
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' AND sede <> 'spinhouse';

-- `jugadores.sede` la recalcula la base desde los bloques (migración 111), pero
-- solo cuando cambia una inscripción. Sin esto, las fichas seguirían diciendo
-- "buin" hasta que alguien tocara su horario.
UPDATE jugadores
SET sede = 'spinhouse'
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' AND sede IS NOT NULL AND sede <> 'spinhouse';


-- ══ 2. El alumno solo opina de SU profesor (hallazgo 6) ═══════════════════
-- La política anterior comprobaba que el profesor fuera del club, pero no que
-- le hiciera clases. La pantalla sí lo filtra, pero la pantalla no es el
-- guardia — es la misma regla que ya rige en el resto del repo.
--
-- Las columnas de la fila se califican con el nombre de la tabla
-- (`feedback_profesores.jugador_id`) y no a secas: adentro del EXISTS hay un
-- `bloque_jugadores` que también tiene `jugador_id`, y sin calificar la
-- comparación se resolvería contra la tabla de adentro y sería siempre cierta.
DROP POLICY IF EXISTS "feedback_profes_propio" ON public.feedback_profesores;
CREATE POLICY "feedback_profes_propio" ON public.feedback_profesores
  FOR ALL
  USING      (jugador_id = get_my_jugador_id())
  WITH CHECK (
    jugador_id = get_my_jugador_id()
    AND club_id = get_my_club_id()
    AND EXISTS (
      SELECT 1
      FROM bloque_jugadores bj
      JOIN bloque_profesores bp
        ON bp.bloque_id = bj.bloque_id AND bp.vigente_hasta IS NULL
      JOIN bloques_horario b
        ON b.id = bj.bloque_id AND b.club_id = get_my_club_id()
      WHERE bj.jugador_id = feedback_profesores.jugador_id
        AND bj.vigente_hasta IS NULL
        AND bp.profesor_id = feedback_profesores.profesor_id
    )
  );


-- ══ 3. Decisiones dejadas por escrito ═════════════════════════════════════
-- Hallazgo 4: el profesor PUEDE asignar una recuperación a quien no tiene
-- saldo. Se confirmó que es a propósito. Sin este comentario, el próximo que
-- lea la función no puede distinguir la decisión del olvido.
COMMENT ON FUNCTION public.asignar_recuperacion_dia(uuid, uuid, date) IS
  'Asigna una recuperación. A propósito NO exige que el alumno tenga saldo: el profesor puede pasar por encima (decidido con el club, 2026-08-28). El saldo que muestra la pantalla es orientativo.';

-- Hallazgo 8: las horas de `asistencia_profesores` se calculan con el horario
-- actual del bloque, así que un cambio de horario mueve los meses ya cerrados.
-- Se confirmó que NO se usan para liquidar sueldos, solo para control, por lo
-- que no se congelan los minutos al marcar.
COMMENT ON TABLE public.asistencia_profesores IS
  'El profesor estuvo en ese bloque ese día. Las horas se calculan con el horario vigente del bloque, así que cambiarlo mueve los meses pasados: aceptado porque son para control y no para liquidar sueldos (decidido con el club, 2026-08-28). Si algún día se pagan con esto, guardar los minutos en la fila.';

COMMIT;

-- ── Verificación (correr aparte, después del COMMIT) ──────────────────────
--
-- Spinhouse en su sede, y nadie más movido (espera spinhouse y un conteo > 0):
-- SELECT sede, count(*) FROM bloques_horario
-- WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41' GROUP BY sede;
--
-- Buin intacto (espera solo buin y paine):
-- SELECT sede, count(*) FROM bloques_horario
-- WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc' GROUP BY sede;
--
-- Una sola política sobre feedback_profesores, y el anonimato sigue en pie:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feedback_profesores';
