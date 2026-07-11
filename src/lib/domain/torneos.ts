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

function construirBracketDesdePosiciones(posiciones: Array<JugadorTorneo | null>, fase: string): PartidoGenerado[] {
  const partidos: PartidoGenerado[] = []
  for (let k = 0; k < posiciones.length / 2; k++) {
    const jugA = posiciones[2 * k] ?? null
    const jugB = posiciones[2 * k + 1] ?? null
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

function posicionesSembradas(tam: number): number[] {
  const slots = slotsSeed(tam)
  const posiciones = Array(tam + 1).fill(0)
  slots.forEach((seed, pos) => { posiciones[seed] = pos })
  return posiciones.slice(1)
}

function mitadDe(pos: number, tam: number): 0 | 1 {
  return pos < tam / 2 ? 0 : 1
}

function posicionarCuposEspejo(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): Array<JugadorTorneo | null> {
  const total = primeros.length + segundos.length
  const tam = calcularTamanoBracket(total)
  const posiciones: Array<JugadorTorneo | null> = Array(tam).fill(null)
  const seedPositions = posicionesSembradas(tam)
  const groupCount = Math.max(primeros.length, segundos.length)
  const posPrimeros = new Map<number, number>()

  const grupoDeSemilla = (id?: string | null): number | null => {
    if (!id) return null
    const idx = primeros.findIndex(j => j.id === id)
    if (idx >= 0) return idx
    return null
  }

  const ordenGrupos = Array.from({ length: groupCount }, (_, i) => i)
  const c1 = grupoDeSemilla(semilla1Id)
  const c2Raw = grupoDeSemilla(semilla2Id)
  const c2 = c2Raw !== c1 ? c2Raw : null
  const gruposPriorizados = [c1, c2, ...ordenGrupos]
    .filter((g): g is number => g != null)
    .filter((g, i, arr) => arr.indexOf(g) === i)

  const ocupar = (jugador: JugadorTorneo | undefined, preferencias: number[]): number | null => {
    if (!jugador) return null
    const pos = preferencias.find(p => p >= 0 && p < tam && posiciones[p] === null)
    if (pos == null) return null
    posiciones[pos] = jugador
    return pos
  }

  gruposPriorizados.forEach((g, idx) => {
    const jugador = primeros[g]
    if (!jugador) return
    const preferencias = idx === 0
      ? [seedPositions[0], ...seedPositions]
      : idx === 1
        ? [seedPositions[1], ...seedPositions]
        : seedPositions
    const pos = ocupar(jugador, preferencias)
    if (pos != null) posPrimeros.set(g, pos)
  })

  gruposPriorizados.forEach(g => {
    const jugador = segundos[g]
    if (!jugador) return
    const posPrimero = posPrimeros.get(g)
    const mitadObjetivo = posPrimero == null ? null : (mitadDe(posPrimero, tam) === 0 ? 1 : 0)
    const espejo = posPrimero == null ? -1 : (posPrimero + tam / 2) % tam
    const preferencias = [
      espejo,
      ...seedPositions.filter(p => mitadObjetivo == null || mitadDe(p, tam) === mitadObjetivo),
      ...seedPositions,
    ]
    ocupar(jugador, preferencias)
  })

  return posiciones
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
  const total = primeros.length + segundos.length
  if (total < 2) return []
  const tam = calcularTamanoBracket(total)
  const faseInicialNueva = determinarFaseInicial(tam)
  return construirBracketDesdePosiciones(
    posicionarCuposEspejo(primeros, segundos, semilla1Id, semilla2Id),
    faseInicialNueva,
  )

  /*
  const orden = aplicarSemillasPrincipales([...primeros, ...segundos], semilla1Id, semilla2Id)
  if (orden.length < 2) return []
  const faseInicial = determinarFaseInicial(calcularTamanoBracket(orden.length))
  const partidos = construirBracket(orden, faseInicial)

  // Map each player ID → group index to detect same-group first-round pairings
  const grupoIdx = new Map<string, number>()
  primeros.forEach((j, i) => grupoIdx.set(j.id, i))
  segundos.forEach((j, i) => grupoIdx.set(j.id, i))

  // ponytail: O(n²) swap pass, n ≤ 16 matches
  for (let i = 0; i < partidos.length; i++) {
    const p = partidos[i]
    if (!p.jugadorB) continue
    const ga = grupoIdx.get(p.jugadorA)
    const gb = grupoIdx.get(p.jugadorB)
    if (ga === undefined || gb === undefined || ga !== gb) continue
    for (let j = 0; j < partidos.length; j++) {
      if (i === j || !partidos[j].jugadorB) continue
      const q = partidos[j]
      const qga = grupoIdx.get(q.jugadorA)!
      const qgb = grupoIdx.get(q.jugadorB!)!
      if (ga !== qga && qgb !== gb) {
        const tmp = p.jugadorB
        partidos[i] = { ...p, jugadorB: q.jugadorA }
        partidos[j] = { ...q, jugadorA: tmp }
        break
      }
      if (ga !== qgb && qga !== gb) {
        const tmp = p.jugadorB
        partidos[i] = { ...p, jugadorB: q.jugadorB }
        partidos[j] = { ...q, jugadorB: tmp }
        break
      }
    }
  }

  return partidos
  */
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

// ─── Llaves incrementales ────────────────────────────────────────────────────
// El cuadro tiene tamaño fijo desde que se conocen los grupos (2 clasificados por
// grupo), así que su forma y la posición de cada cupo se pueden calcular antes de
// que terminen los grupos. Cada cupo se identifica por (grupoIdx, pos) y se va
// rellenando con el jugador real apenas ese grupo termina. Reutiliza el mismo
// sembrado que `generarBracketConAvance` (cabezas de serie en mitades opuestas).

export interface LlaveSlot { grupoIdx: number; pos: 1 | 2 }
export interface LlaveMatch { orden: number; a: LlaveSlot | null; b: LlaveSlot | null }
export interface LlavesLayout { faseInicial: FaseOrden; matches: LlaveMatch[] }

export function construirLlavesLayout(
  numGrupos: number,
  cabeza1GrupoIdx?: number | null,
  cabeza2GrupoIdx?: number | null,
): LlavesLayout {
  const primeros = Array.from({ length: numGrupos }, (_, i) => ({ id: `${i}:1`, nombre: '', elo: 0 }))
  const segundos = Array.from({ length: numGrupos }, (_, i) => ({ id: `${i}:2`, nombre: '', elo: 0 }))
  // Los cabezas de serie protegidos se anclan al 1° de su grupo.
  const c1 = cabeza1GrupoIdx != null ? `${cabeza1GrupoIdx}:1` : null
  let c2 = cabeza2GrupoIdx != null ? `${cabeza2GrupoIdx}:1` : null
  if (c2 && c2 === c1) c2 = null

  const bracket = generarBracketConAvance(primeros, segundos, c1, c2)
  const parse = (id: string | null | undefined): LlaveSlot | null => {
    if (!id) return null
    const [g, p] = id.split(':')
    return { grupoIdx: Number(g), pos: Number(p) as 1 | 2 }
  }
  return {
    faseInicial: (bracket[0]?.fase as FaseOrden) ?? 'final',
    matches: bracket.map(p => ({ orden: p.orden, a: parse(p.jugadorA), b: parse(p.jugadorB) })),
  }
}

export function generarSiguienteFase(
  ganadores: JugadorTorneo[],
  faseActual: FaseOrden,
  _semilla1Id?: string | null,
  _semilla2Id?: string | null,
): PartidoGenerado[] {
  const fase = siguienteFase(faseActual)
  if (!fase) return []
  // El cuadro ya iniciado conserva su camino: ganador llave 1 vs ganador llave 2,
  // ganador llave 3 vs ganador llave 4, etc.
  const partidos: PartidoGenerado[] = []
  for (let i = 0; i < ganadores.length; i += 2) {
    const a = ganadores[i]
    const b = ganadores[i + 1]
    if (!a) continue
    partidos.push({
      jugadorA: a.id,
      jugadorB: b?.id ?? null,
      ganador: b ? null : a.id,
      fase,
      orden: partidos.length,
    })
  }
  return partidos
}
