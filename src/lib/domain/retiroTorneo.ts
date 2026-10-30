/**
 * Cómo se saca a un jugador de un torneo en curso sin dejar partidos contra
 * nadie.
 *
 * Eliminar a un jugador desde Jugadores le ponía NULL en sus partidos y lo
 * sacaba del grupo sin rearmar nada: sus rivales quedaban con partidos "vs —".
 * Pasó en sub19 (2026-08-16), TCB (2026-09-06) y TC A / TC B (2026-10-25).
 * Ahora eliminar primero retira al jugador del torneo, y esta función decide
 * cómo:
 *
 *  - `quitar`: todavía no se jugó nada en su grupo. Sale del grupo y los
 *    partidos se rehacen sin él, como si nunca hubiera estado.
 *  - `wo`: ya hay resultados en su grupo, o él ya está en la llave. Lo jugado no
 *    se toca (rehacer el grupo borraría resultados de otros), sus partidos
 *    pendientes pasan a W.O. para el rival, y queda marcado como retirado: no
 *    clasifica aunque haya ganado partidos.
 *  - `bloqueado`: su grupo quedaría con un solo jugador activo. Un grupo así no
 *    puede dar sus dos clasificados y cuelga la llave; hay que mover antes al
 *    que queda (el grupo vacío se borra solo).
 */
export type DecisionRetiro =
  | { modo: 'quitar' }
  | { modo: 'wo' }
  | { modo: 'bloqueado'; motivo: string }

export const MOTIVO_GRUPO_DE_UNO =
  'Su grupo quedaría con un solo jugador, y así no puede dar sus dos clasificados. ' +
  'Mueve antes al otro jugador a otro grupo (el grupo vacío se borra solo) y vuelve a intentarlo.'

export function decidirRetiro(p: {
  /** Grupo armado a mano que todavía no se finaliza: no tiene partidos. */
  enPreparacion: boolean
  /** Partidos de fase de grupos de SU grupo. */
  partidosGrupo: ReadonlyArray<{ ganador: string | null }>
  /** Cuántos OTROS integrantes de su grupo siguen jugando (sin retirados). */
  otrosActivos: number
  /** Si él ya aparece en algún partido de la llave. */
  estaEnLaLlave: boolean
  /** Si algún partido de la llave ya se jugó (de cualquier grupo). */
  llaveConResultados: boolean
}): DecisionRetiro {
  if (p.enPreparacion) return { modo: 'quitar' }

  // Si ya está en la llave, su grupo terminó y sus clasificados ya se volcaron:
  // solo queda darle W.O. en lo que tenga pendiente ahí.
  if (p.estaEnLaLlave) return { modo: 'wo' }

  // De acá en adelante su grupo tiene que poder dar dos clasificados sin él.
  if (p.otrosActivos < 2) return { modo: 'bloqueado', motivo: MOTIVO_GRUPO_DE_UNO }

  const grupoConResultados = p.partidosGrupo.some(x => !!x.ganador)
  // Rehacer el grupo es seguro solo si no se jugó nada en él y la llave no
  // empezó: con la llave en juego, sus cupos ya apuntan a este grupo.
  if (!grupoConResultados && !p.llaveConResultados) return { modo: 'quitar' }
  return { modo: 'wo' }
}
