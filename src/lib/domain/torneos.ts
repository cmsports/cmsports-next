import { CONFIG, FaseOrden } from '../config'

export interface JugadorTorneo {
  id: string
  nombre: string
  elo: number
}

export interface GrupoStats {
  jugadorId: string
  jugador: JugadorTorneo
  pts: number
  pg: number
  pp: number
  setsGanados: number
  puntosGanados: number
}

export interface PartidoGenerado {
  jugadorA: string
  jugadorB: string | null
  ganador?: string | null
  fase: string
  grupoId?: string
  orden: number
}

export interface SeedResult {
  grupoIndex: number
  jugadorId: string
}

// ─── Grupos ────────────────────────────────────────────────────────────────

export function calcularNumGrupos(
  numJugadores: number,
  jugadoresPorGrupo: number = CONFIG.TORNEO_JUGADORES_POR_GRUPO,
): number {
  return Math.max(2, Math.round(numJugadores / jugadoresPorGrupo))
}

export function seedingSerpenteo(
  jugadores: JugadorTorneo[],
  numGrupos: number,
  cabezasDeSerie: Set<string> = new Set(),
): SeedResult[] {
  const cabezas = jugadores.filter(j => cabezasDeSerie.has(j.id))
  const resto = jugadores.filter(j => !cabezasDeSerie.has(j.id))
  resto.sort((a, b) => (b.elo ?? CONFIG.ELO_INICIAL) - (a.elo ?? CONFIG.ELO_INICIAL))
  const ordenados = [...cabezas, ...resto]

  const asignaciones: SeedResult[] = []
  let dir = 1
  let gi = 0

  for (let i = 0; i < ordenados.length; i++) {
    asignaciones.push({ grupoIndex: gi, jugadorId: ordenados[i].id })
    if (i < ordenados.length - 1) {
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
  }

  return asignaciones
}

export function generarRoundRobin(jugadorIds: string[]): Array<[string, string]> {
  const partidos: Array<[string, string]> = []
  for (let i = 0; i < jugadorIds.length; i++) {
    for (let j = i + 1; j < jugadorIds.length; j++) {
      partidos.push([jugadorIds[i], jugadorIds[j]])
    }
  }
  return partidos
}

// ─── Stats de grupo ────────────────────────────────────────────────────────

export function calcularStatsGrupo(
  jugadores: JugadorTorneo[],
  partidos: Array<{
    jugadorA: string
    jugadorB: string
    ganador: string | null
    setsGanador?: number
    puntosGanador?: number
  }>,
  criterioEmpate: 'sets' | 'puntos' = 'sets',
): { stats: GrupoStats[]; hayTripleEmpate: boolean } {
  const statsMap: Record<string, GrupoStats> = {}
  for (const j of jugadores) {
    statsMap[j.id] = {
      jugadorId: j.id,
      jugador: j,
      pts: 0,
      pg: 0,
      pp: 0,
      setsGanados: 0,
      puntosGanados: 0,
    }
  }

  for (const p of partidos) {
    if (!p.ganador) continue
    const perdedor = p.jugadorA === p.ganador ? p.jugadorB : p.jugadorA
    if (statsMap[p.ganador]) {
      statsMap[p.ganador].pts += 2
      statsMap[p.ganador].pg += 1
      if (p.setsGanador) statsMap[p.ganador].setsGanados += p.setsGanador
      if (p.puntosGanador) statsMap[p.ganador].puntosGanados += p.puntosGanador
    }
    if (statsMap[perdedor]) {
      statsMap[perdedor].pp += 1
    }
  }

  const ordenados = Object.values(statsMap).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (criterioEmpate === 'sets') return b.setsGanados - a.setsGanados
    return b.puntosGanados - a.puntosGanados
  })

  const primerPts = ordenados[0]?.pts ?? 0
  const empatados = ordenados.filter(j => j.pts === primerPts)
  const hayTripleEmpate = empatados.length >= 3

  return { stats: ordenados, hayTripleEmpate }
}

// ─── Playoffs ──────────────────────────────────────────────────────────────

export function calcularTamanoBracket(numClasificados: number): number {
  let tam = 2
  while (tam < numClasificados) tam *= 2
  return tam
}

export function determinarFaseInicial(tamanoBracket: number): FaseOrden {
  if (tamanoBracket <= 2) return 'final'
  if (tamanoBracket <= 4) return 'semis'
  if (tamanoBracket <= 8) return 'cuartos'
  if (tamanoBracket <= 16) return '8vos'
  return '16vos'
}

export function siguienteFase(faseActual: FaseOrden): FaseOrden | null {
  const idx = CONFIG.FASES_ORDEN.indexOf(faseActual)
  if (idx < 0 || idx >= CONFIG.FASES_ORDEN.length - 1) return null
  return CONFIG.FASES_ORDEN[idx + 1]
}

export function generarBracketEspejo(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
): PartidoGenerado[] {
  const semillas = [...primeros, ...segundos.slice().reverse()]
  const n = semillas.length
  if (n < 2) return []

  const tamBracket = calcularTamanoBracket(n)
  const numByes = tamBracket - n
  const faseInicial = determinarFaseInicial(tamBracket)

  const conBye = semillas.slice(0, numByes)
  const sinBye = semillas.slice(numByes)

  const partidos: PartidoGenerado[] = []
  const mid = Math.floor(sinBye.length / 2)

  for (let i = 0; i < mid; i++) {
    const jugA = sinBye[i]
    const jugB = sinBye[sinBye.length - 1 - i]
    if (jugA && jugB && jugA.id !== jugB.id) {
      partidos.push({
        jugadorA: jugA.id,
        jugadorB: jugB.id,
        fase: faseInicial,
        orden: i,
      })
    }
  }

  for (let i = 0; i < conBye.length; i++) {
    partidos.push({
      jugadorA: conBye[i].id,
      jugadorB: null,
      ganador: conBye[i].id,
      fase: faseInicial,
      orden: mid + i,
    })
  }

  return partidos
}

export function generarSiguienteFase(
  ganadores: JugadorTorneo[],
  faseActual: FaseOrden,
): PartidoGenerado[] {
  const fase = siguienteFase(faseActual)
  if (!fase) return []

  const sorted = [...ganadores].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
  const mid = Math.floor(sorted.length / 2)
  const partidos: PartidoGenerado[] = []

  for (let i = 0; i < mid; i++) {
    partidos.push({
      jugadorA: sorted[i].id,
      jugadorB: sorted[sorted.length - 1 - i].id,
      fase,
      orden: i,
    })
  }

  if (sorted.length % 2 !== 0) {
    const bye = sorted[Math.floor(sorted.length / 2)]
    partidos.push({
      jugadorA: bye.id,
      jugadorB: null,
      ganador: bye.id,
      fase,
      orden: mid,
    })
  }

  return partidos
}
