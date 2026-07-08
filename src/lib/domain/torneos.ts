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
  // ELO ya no influye en el sembrado: los cabezas de serie van primero, el
  // resto conserva el orden recibido.
  const cabezas = jugadores.filter(j => cabezasDeSerie.has(j.id))
  const resto = jugadores.filter(j => !cabezasDeSerie.has(j.id))
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

// ─── Semillas principales (cabezas de serie 1° y 2°) ──────────────────────

// Mueve los cabezas de serie 1° y 2° (si están en la lista) al frente, sin
// reordenar al resto. Como el cuadro se arma con sembrado estándar (ver
// `slotsSeed`), quedar 1° y 2° en la lista garantiza que caen en mitades
// opuestas y solo se pueden enfrentar en la final. Sin depender del ELO.
export function aplicarSemillasPrincipales<T extends { id: string }>(
  lista: T[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): T[] {
  if (!semilla1Id && !semilla2Id) return lista
  const semilla1 = lista.find(j => j.id === semilla1Id)
  const semilla2 = lista.find(j => j.id === semilla2Id)
  const resto = lista.filter(j => j.id !== semilla1Id && j.id !== semilla2Id)
  return [semilla1, semilla2, ...resto].filter((x): x is T => !!x)
}

// Orden de sembrado estándar (bit-reversal) para un cuadro de tamaño `tam`
// (potencia de 2). Devuelve, por cada slot, el número de sembrado (1..tam) que
// va ahí. Emparejando slots consecutivos (0-1, 2-3, …) el sembrado 1 y 2 caen
// en mitades opuestas: solo se cruzan en la final. Ej: tam=8 → [1,8,4,5,2,7,3,6].
export function slotsSeed(tam: number): number[] {
  let rondas = [1]
  while (rondas.length < tam) {
    const m = rondas.length * 2
    const next: number[] = []
    for (const s of rondas) { next.push(s); next.push(m + 1 - s) }
    rondas = next
  }
  return rondas
}

// Arma los partidos de una ronda a partir de una lista ya ordenada por sembrado
// (el 1° sembrado primero). Completa con BYEs a los sembrados más débiles.
function construirBracket(orden: JugadorTorneo[], fase: string): PartidoGenerado[] {
  const n = orden.length
  if (n < 2) return []
  const tam = calcularTamanoBracket(n)
  const slots = slotsSeed(tam)
  const partidos: PartidoGenerado[] = []
  for (let k = 0; k < tam / 2; k++) {
    const jugA = orden[slots[2 * k] - 1] ?? null       // sembrado → jugador (o BYE)
    const jugB = orden[slots[2 * k + 1] - 1] ?? null
    if (jugA && jugB) {
      partidos.push({ jugadorA: jugA.id, jugadorB: jugB.id, fase, orden: k })
    } else if (jugA) {
      partidos.push({ jugadorA: jugA.id, jugadorB: null, ganador: jugA.id, fase, orden: k })
    } else if (jugB) {
      partidos.push({ jugadorA: jugB.id, jugadorB: null, ganador: jugB.id, fase, orden: k })
    }
  }
  return partidos
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
  if (tamanoBracket <= 32) return '16vos'
  return '32vos'
}

export function siguienteFase(faseActual: FaseOrden): FaseOrden | null {
  const idx = CONFIG.FASES_ORDEN.indexOf(faseActual)
  if (idx < 0 || idx >= CONFIG.FASES_ORDEN.length - 1) return null
  return CONFIG.FASES_ORDEN[idx + 1]
}

export function generarBracketEspejo(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): PartidoGenerado[] {
  const orden = aplicarSemillasPrincipales([...primeros, ...segundos], semilla1Id, semilla2Id)
  if (orden.length < 2) return []
  const faseInicial = determinarFaseInicial(calcularTamanoBracket(orden.length))
  return construirBracket(orden, faseInicial)
}

// Un solo motor de armado para cualquier cantidad de clasificados. Los BYEs los
// coloca el sembrado estándar en los sembrados más débiles.
export function generarBracketConAvance(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): PartidoGenerado[] {
  return generarBracketEspejo(primeros, segundos, semilla1Id, semilla2Id)
}

export function generarSiguienteFase(
  ganadores: JugadorTorneo[],
  faseActual: FaseOrden,
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): PartidoGenerado[] {
  const fase = siguienteFase(faseActual)
  if (!fase) return []
  // Se re-siembra cada ronda: mientras 1° y 2° sigan ganando, vuelven a caer en
  // mitades opuestas y no se cruzan hasta la final.
  const orden = aplicarSemillasPrincipales([...ganadores], semilla1Id, semilla2Id)
  return construirBracket(orden, fase)
}
