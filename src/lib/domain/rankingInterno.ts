import { puestosDelTorneo, type PartidoDelTorneo } from './puntajeTorneo'

export type ResultadoJugadorRanking = {
  jugadorId: string
  nombre: string
  pts: number
  victorias: number
  derrotas: number
  jugados: number
  /** En cuántos torneos de la categoría participó. */
  torneos: number
  /** Puesto compartido: dos jugadores con los mismos puntos tienen el mismo
   *  rank (1, 1, 3 — no 1, 2, 3). Ver `calcularRankingInterno`. */
  rank: number
}

/** Los partidos de un torneo, juntos: el puesto solo existe dentro de uno. */
export type TorneoConPartidos = {
  torneoId: string
  partidos: PartidoDelTorneo[]
}

/**
 * Arma el ranking acumulado de una categoría, torneo por torneo.
 *
 * Los puntos salen del PUESTO en que terminó cada jugador en cada torneo —100
 * el campeón, 90 el finalista, y así hasta 9 por quedarse en la fase de
 * grupos—, y se suman entre todos los torneos de la categoría. Antes se pagaba
 * por partido ganado, duplicando por ronda; el club pasó a premiar dónde
 * terminaste, no cuántos partidos ganaste para llegar ahí.
 *
 * Por eso hay que recibir los partidos AGRUPADOS POR TORNEO: el puesto no
 * existe fuera de uno. Con todos los partidos mezclados no se puede saber
 * quién ganó qué final.
 *
 * Nadie pierde puntos por perder, así que jugar más torneos nunca baja a nadie
 * — solo suma oportunidades.
 *
 * El puesto en la tabla se calcula solo por puntos: compartirlos es correcto
 * cuando dos jugadores empataron de verdad, y mostrarlo como "1°, 2°" sin
 * serlo sería inventar un orden que los datos no tienen. Victorias y derrotas
 * ordenan la lista dentro del empate, pero no cambian el número de puesto.
 */
export function calcularRankingInterno(
  torneos: TorneoConPartidos[],
  nombreDe: (jugadorId: string) => string,
  /**
   * Puntos con los que arranca cada jugador, de un ranking anterior al sistema.
   *
   * La Asociación Buin-Paine venía con su ranking en planilla y esos torneos no
   * están cargados, así que sus puntos no se pueden recalcular. Entran acá como
   * arrastre y lo que se juegue después suma encima.
   *
   * Quien solo tiene saldo aparece igual en la tabla, aunque todavía no haya
   * jugado ningún torneo en el sistema: es justamente su posición de hoy.
   */
  saldoInicial?: Map<string, number>,
): ResultadoJugadorRanking[] {
  const stats = new Map<string, { pts: number; victorias: number; derrotas: number; torneos: number }>()
  const fila = (id: string) => {
    let s = stats.get(id)
    if (!s) { s = { pts: 0, victorias: 0, derrotas: 0, torneos: 0 }; stats.set(id, s) }
    return s
  }

  // El saldo va primero para que quien solo lo tiene no quede fuera de la tabla.
  // No cuenta como torneo jugado: son puntos traídos, no partidos del sistema.
  if (saldoInicial) {
    for (const [jugadorId, puntos] of saldoInicial) fila(jugadorId).pts += puntos
  }

  for (const torneo of torneos) {
    // Victorias y derrotas siguen contándose partido a partido: ya no dan
    // puntos, pero son lo que se muestra en la tabla y lo que desempata.
    for (const p of torneo.partidos) {
      if (!p.jugador_b || !p.ganador) continue
      const a = fila(p.jugador_a)
      const b = fila(p.jugador_b)
      if (p.ganador === p.jugador_a) { a.victorias++; b.derrotas++ }
      else if (p.ganador === p.jugador_b) { b.victorias++; a.derrotas++ }
      // ganador que no calza con ninguno de los dos: partido mal cargado, se
      // ignora en vez de reventar el ranking de todos los demás.
    }

    for (const [jugadorId, puesto] of puestosDelTorneo(torneo.partidos)) {
      const s = fila(jugadorId)
      s.pts += puesto.puntos
      s.torneos++
    }
  }

  const filas: ResultadoJugadorRanking[] = [...stats.entries()].map(([jugadorId, s]) => ({
    jugadorId, nombre: nombreDe(jugadorId),
    pts: s.pts, victorias: s.victorias, derrotas: s.derrotas,
    jugados: s.victorias + s.derrotas, torneos: s.torneos,
    rank: 0,
  }))

  filas.sort((x, y) => y.pts - x.pts || y.victorias - x.victorias || x.derrotas - y.derrotas)

  let rankActual = 0
  let ptsAnterior: number | null = null
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].pts !== ptsAnterior) { rankActual = i + 1; ptsAnterior = filas[i].pts }
    filas[i].rank = rankActual
  }

  return filas
}
