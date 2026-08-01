import { CONFIG, type FaseOrden } from '@/lib/config'

/**
 * Puntos por ganar un partido en cada fase: se duplican por ronda superada
 * (2 elevado a la posición de la fase en `FASES_ORDEN`). Avanzar profundo en
 * un cuadro grande pesa mucho más que ganar el primer partido, y a diferencia
 * de "3 pts fijos por victoria" los totales dejan de caer todos en múltiplos
 * de 3 — que era la principal causa de los empates.
 *
 * Una fase que no está en la lista (dato viejo o corrupto) da el mínimo, no
 * cero: perder la fase no debería borrar la victoria.
 */
export function puntosPorFase(fase: string | null): number {
  const idx = fase ? CONFIG.FASES_ORDEN.indexOf(fase as FaseOrden) : -1
  if (idx < 0) return 1
  return 2 ** idx
}

export type ResultadoJugadorRanking = {
  jugadorId: string
  nombre: string
  pts: number
  victorias: number
  derrotas: number
  jugados: number
  /** Puesto compartido: dos jugadores con los mismos puntos tienen el mismo
   *  rank (1, 1, 3 — no 1, 2, 3). Ver `calcularRankingInterno`. */
  rank: number
}

/**
 * Arma el ranking a partir de partidos ya jugados (con ganador definido).
 * Nadie pierde puntos por perder, así que jugar más torneos nunca puede bajar
 * la posición de nadie — solo suma oportunidades.
 *
 * El puesto se calcula solo por puntos: compartirlos es correcto cuando dos
 * jugadores empataron de verdad, y mostrarlo como "1°, 2°" sin serlo sería
 * inventar un orden que los datos no tienen. Victorias y derrotas ordenan la
 * lista dentro del empate de puntos, para que la tabla tenga un orden estable
 * de mostrar, pero no cambian el número de puesto.
 */
export function calcularRankingInterno(
  partidos: Array<{ jugador_a: string; jugador_b: string; ganador: string; fase: string | null }>,
  nombreDe: (jugadorId: string) => string,
): ResultadoJugadorRanking[] {
  const stats = new Map<string, { pts: number; victorias: number; derrotas: number }>()
  const fila = (id: string) => {
    let s = stats.get(id)
    if (!s) { s = { pts: 0, victorias: 0, derrotas: 0 }; stats.set(id, s) }
    return s
  }

  for (const p of partidos) {
    const a = fila(p.jugador_a)
    const b = fila(p.jugador_b)
    if (p.ganador === p.jugador_a) {
      a.victorias++; b.derrotas++
      a.pts += puntosPorFase(p.fase)
    } else if (p.ganador === p.jugador_b) {
      b.victorias++; a.derrotas++
      b.pts += puntosPorFase(p.fase)
    }
    // ganador que no calza con ninguno de los dos: partido mal cargado, se
    // ignora en vez de reventar el ranking de todos los demás.
  }

  const filas: ResultadoJugadorRanking[] = [...stats.entries()].map(([jugadorId, s]) => ({
    jugadorId, nombre: nombreDe(jugadorId),
    pts: s.pts, victorias: s.victorias, derrotas: s.derrotas, jugados: s.victorias + s.derrotas,
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
