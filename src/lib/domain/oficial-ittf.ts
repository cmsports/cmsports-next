/**
 * Clasificación de grupos según Manual del Juez General ITTF:
 * - Ganador: 2 puntos
 * - Perdedor de partido jugado/completo: 1 punto
 * - Perdedor W.O. / retiro / partido no completado: 0 puntos
 * Desempates solo entre empatados: pts → ratio juegos → ratio puntos.
 */

export type SetMarcador = [number, number]

/** Cierre de partido: jugado completo, W.O. sin juego, o retiro a mitad. */
export type TipoCierreOficial = 'jugado' | 'walkover' | 'retiro'

/** Alcance de ausencia / descalificación (§1.6–1.7). */
export type AlcanceSancionOficial = 'partido' | 'evento' | 'campeonato'

export interface PartidoOficialStats {
  inscritoA: string
  inscritoB: string
  ganador: string | null
  sets?: SetMarcador[]
  /** true si W.O. o retiro (partido incompleto → 0 pts al perdedor). */
  esWalkover?: boolean
  tipoCierre?: TipoCierreOficial | null
}

export interface StatsOficial {
  inscritoId: string
  pts: number
  pg: number
  pp: number
  juegosGanados: number
  juegosPerdidos: number
  puntosGanados: number
  puntosPerdidos: number
}

function ratio(a: number, b: number): number {
  if (a === 0 && b === 0) return 0
  if (b === 0) return Number.POSITIVE_INFINITY
  return a / b
}

function conteoSets(sets: SetMarcador[]): {
  juegosA: number
  juegosB: number
  puntosA: number
  puntosB: number
} {
  let juegosA = 0
  let juegosB = 0
  let puntosA = 0
  let puntosB = 0
  for (const [pa, pb] of sets) {
    puntosA += pa
    puntosB += pb
    if (pa > pb) juegosA++
    else if (pb > pa) juegosB++
  }
  return { juegosA, juegosB, puntosA, puntosB }
}

export function ganadorDesdeSets(
  inscritoA: string,
  inscritoB: string,
  sets: SetMarcador[],
  gamesParaGanar = 3,
): string | null {
  const { juegosA, juegosB } = conteoSets(sets)
  if (juegosA >= gamesParaGanar) return inscritoA
  if (juegosB >= gamesParaGanar) return inscritoB
  return null
}

function acumularPartido(
  stats: Record<string, StatsOficial>,
  p: PartidoOficialStats,
) {
  if (!p.ganador) return
  const perdedor = p.inscritoA === p.ganador ? p.inscritoB : p.inscritoA
  const sG = stats[p.ganador]
  const sP = stats[perdedor]
  if (!sG || !sP) return

  sG.pts += 2
  sG.pg += 1
  sP.pp += 1
  if (!p.esWalkover) sP.pts += 1

  const sets = p.sets ?? []
  if (sets.length === 0 && p.esWalkover) {
    sG.juegosGanados += 3
    sG.puntosGanados += 33
    sP.juegosPerdidos += 3
    sP.puntosPerdidos += 33
    return
  }

  const c = conteoSets(sets)
  if (p.ganador === p.inscritoA) {
    sG.juegosGanados += c.juegosA
    sG.juegosPerdidos += c.juegosB
    sG.puntosGanados += c.puntosA
    sG.puntosPerdidos += c.puntosB
    sP.juegosGanados += c.juegosB
    sP.juegosPerdidos += c.juegosA
    sP.puntosGanados += c.puntosB
    sP.puntosPerdidos += c.puntosA
  } else {
    sG.juegosGanados += c.juegosB
    sG.juegosPerdidos += c.juegosA
    sG.puntosGanados += c.puntosB
    sG.puntosPerdidos += c.puntosA
    sP.juegosGanados += c.juegosA
    sP.juegosPerdidos += c.juegosB
    sP.puntosGanados += c.puntosA
    sP.puntosPerdidos += c.puntosB
  }
}

function compararEmpatados(
  a: StatsOficial,
  b: StatsOficial,
  subsetStats: Record<string, StatsOficial>,
): number {
  const sa = subsetStats[a.inscritoId]
  const sb = subsetStats[b.inscritoId]
  if (!sa || !sb) return 0
  if (sa.pts !== sb.pts) return sb.pts - sa.pts
  const rJa = ratio(sa.juegosGanados, sa.juegosPerdidos)
  const rJb = ratio(sb.juegosGanados, sb.juegosPerdidos)
  if (rJa !== rJb) return rJb > rJa ? 1 : -1
  const rPa = ratio(sa.puntosGanados, sa.puntosPerdidos)
  const rPb = ratio(sb.puntosGanados, sb.puntosPerdidos)
  if (rPa !== rPb) return rPb > rPa ? 1 : -1
  return 0
}

function statsDeSubconjunto(
  ids: string[],
  partidos: PartidoOficialStats[],
): Record<string, StatsOficial> {
  const set = new Set(ids)
  const stats: Record<string, StatsOficial> = {}
  for (const id of ids) {
    stats[id] = {
      inscritoId: id,
      pts: 0,
      pg: 0,
      pp: 0,
      juegosGanados: 0,
      juegosPerdidos: 0,
      puntosGanados: 0,
      puntosPerdidos: 0,
    }
  }
  for (const p of partidos) {
    if (!set.has(p.inscritoA) || !set.has(p.inscritoB)) continue
    acumularPartido(stats, p)
  }
  return stats
}

export function clasificarGrupoIttf(
  inscritoIds: string[],
  partidos: PartidoOficialStats[],
): StatsOficial[] {
  const stats = statsDeSubconjunto(inscritoIds, partidos)
  const ordenOriginal = new Map(inscritoIds.map((id, i) => [id, i]))

  const porPuntos = new Map<number, StatsOficial[]>()
  for (const s of Object.values(stats)) {
    const g = porPuntos.get(s.pts) ?? []
    g.push(s)
    porPuntos.set(s.pts, g)
  }

  const ordenados: StatsOficial[] = []
  for (const pts of [...porPuntos.keys()].sort((a, b) => b - a)) {
    const bloque = porPuntos.get(pts) ?? []
    if (bloque.length === 1) {
      ordenados.push(bloque[0])
      continue
    }
    const ids = bloque.map(s => s.inscritoId)
    const subset = statsDeSubconjunto(ids, partidos)
    bloque.sort((a, b) => {
      const cmp = compararEmpatados(a, b, subset)
      if (cmp !== 0) return cmp
      return (ordenOriginal.get(a.inscritoId) ?? 0) - (ordenOriginal.get(b.inscritoId) ?? 0)
    })
    ordenados.push(...bloque)
  }

  return ordenados
}

export function formatearSets(sets: SetMarcador[]): string {
  if (!sets.length) return '—'
  return sets.map(([a, b]) => `${a}-${b}`).join(' · ')
}

export function parsearSetsTexto(texto: string): SetMarcador[] | { error: string } {
  const limpio = texto.trim()
  if (!limpio) return []
  const partes = limpio.split(/[;,|]/).map(p => p.trim()).filter(Boolean)
  const sets: SetMarcador[] = []
  for (const parte of partes) {
    const m = parte.match(/^(\d+)\s*[-:xX]\s*(\d+)$/)
    if (!m) return { error: `Set inválido: "${parte}". Usa formato 11-6` }
    sets.push([Number(m[1]), Number(m[2])])
  }
  return sets
}

export function gamesParaGanarFormato(formato: 'bo3' | 'bo5' | 'bo7'): number {
  if (formato === 'bo3') return 2
  if (formato === 'bo7') return 4
  return 3
}

/** Sets sintéticos 11-0 para W.O. sin juego (§2.3.6–2.3.7). */
export function setsSinteticosWalkover(
  ganadorEsA: boolean,
  gamesParaGanar: number,
): SetMarcador[] {
  const n = Math.max(1, gamesParaGanar)
  return Array.from({ length: n }, () => (ganadorEsA ? [11, 0] : [0, 11]) as SetMarcador)
}

/**
 * Completa un retiro: conserva sets parciales y agrega 11-0 restantes
 * hasta que el ganador alcance gamesParaGanar.
 */
export function completarSetsRetiro(
  setsParciales: SetMarcador[],
  ganadorEsA: boolean,
  gamesParaGanar: number,
): SetMarcador[] {
  const out: SetMarcador[] = setsParciales.map(([a, b]) => [a, b])
  const { juegosA, juegosB } = conteoSets(out)
  let ja = juegosA
  let jb = juegosB
  while (ja < gamesParaGanar && jb < gamesParaGanar) {
    if (ganadorEsA) {
      out.push([11, 0])
      ja++
    } else {
      out.push([0, 11])
      jb++
    }
  }
  return out
}

export type ResolverCierreInput = {
  inscritoA: string
  inscritoB: string
  tipoCierre: TipoCierreOficial
  ganadorId?: string | null
  sets?: SetMarcador[]
  gamesParaGanar: number
}

export type ResolverCierreOk = {
  ganadorId: string
  sets: SetMarcador[]
  tipoCierre: TipoCierreOficial
  /** true → 0 pts al perdedor en clasificación de grupo. */
  esIncompleto: boolean
}

/**
 * Resuelve cierre Jugado / W.O. / Retiro según ITTF §2.3.6–2.3.7.
 * - Jugado: sets completos definen ganador.
 * - W.O.: sin sets jugados → N×11-0 sintéticos a favor del ganador.
 * - Retiro: conserva parciales y completa con 11-0; 0 pts al que se retira.
 */
export function resolverCierrePartido(
  input: ResolverCierreInput,
): ResolverCierreOk | { error: string } {
  const { inscritoA, inscritoB, tipoCierre, gamesParaGanar } = input
  const setsIn = input.sets ?? []

  if (tipoCierre === 'walkover') {
    const ganadorId = input.ganadorId
    if (!ganadorId) return { error: 'En W.O. debes indicar el ganador' }
    if (ganadorId !== inscritoA && ganadorId !== inscritoB) {
      return { error: 'El ganador no pertenece al partido' }
    }
    // Si ya hubo sets jugados, tratar como retiro (conservar parciales).
    if (setsIn.length > 0) {
      return resolverCierrePartido({ ...input, tipoCierre: 'retiro' })
    }
    return {
      ganadorId,
      sets: setsSinteticosWalkover(ganadorId === inscritoA, gamesParaGanar),
      tipoCierre: 'walkover',
      esIncompleto: true,
    }
  }

  if (tipoCierre === 'retiro') {
    const ganadorId = input.ganadorId
    if (!ganadorId) return { error: 'En retiro debes indicar quién gana (el rival del que se retira)' }
    if (ganadorId !== inscritoA && ganadorId !== inscritoB) {
      return { error: 'El ganador no pertenece al partido' }
    }
    const sets = completarSetsRetiro(setsIn, ganadorId === inscritoA, gamesParaGanar)
    return { ganadorId, sets, tipoCierre: 'retiro', esIncompleto: true }
  }

  // jugado
  if (!setsIn.length) return { error: 'Indica los sets (ej. 11-6; 11-8; 11-4)' }
  const derivado = ganadorDesdeSets(inscritoA, inscritoB, setsIn, gamesParaGanar)
  if (!derivado) {
    return { error: `Los sets no definen un ganador al mejor de ${gamesParaGanar * 2 - 1}` }
  }
  if (input.ganadorId && input.ganadorId !== derivado) {
    return { error: 'El ganador no coincide con los sets' }
  }
  return {
    ganadorId: derivado,
    sets: setsIn,
    tipoCierre: 'jugado',
    esIncompleto: false,
  }
}

/**
 * Cantidad de grupos según Manual Juez General §2.2 (~3 jugadores).
 *
 * Regla: preferir grupos de 3; usar 4 cuando el resto lo exija;
 * **evitar grupos de 2** (y de 1) salvo N < 3.
 *
 * Con `G = floor(N/3)` (N≥3) todos los grupos quedan en {3,4}:
 * - N=3k   → k grupos de 3
 * - N=3k+1 → (k-1) de 3 + 1 de 4
 * - N=3k+2 → (k-2) de 3 + 2 de 4
 *
 * `Math.ceil(N/3)` es incorrecto aquí: con N=40 da 14 grupos y fuerza varios de 2.
 */
export function calcularNumGruposOficial(numJugadores: number): number {
  if (numJugadores < 2) return 0
  if (numJugadores < 3) return 1
  return Math.floor(numJugadores / 3)
}

/** Tamaños por grupo (orden estable: primero los más grandes). Solo 3–4 si N≥3. */
export function tamanosGruposOficial(numJugadores: number): number[] {
  const g = calcularNumGruposOficial(numJugadores)
  if (g <= 0) return []
  const base = Math.floor(numJugadores / g)
  const rem = numJugadores % g
  return Array.from({ length: g }, (_, i) => base + (i < rem ? 1 : 0))
}

/**
 * Orden de juego ITTF / Koidan en grupos de 3 y 4 (§2.2).
 * ids[0]=posición 1, ids[1]=2, …
 * - 3: 1-3, 2-3, 1-2
 * - 4: 1-3, 2-4, 1-2, 3-4, 1-4, 2-3 (secuencia Excel compañero)
 * Otros tamaños: round-robin por índice (i < j).
 */
export function ordenPartidosGrupoIttf(ids: string[]): Array<[string, string]> {
  const n = ids.length
  if (n < 2) return []
  if (n === 3) {
    return [
      [ids[0], ids[2]],
      [ids[1], ids[2]],
      [ids[0], ids[1]],
    ]
  }
  if (n === 4) {
    return [
      [ids[0], ids[2]],
      [ids[1], ids[3]],
      [ids[0], ids[1]],
      [ids[2], ids[3]],
      [ids[0], ids[3]],
      [ids[1], ids[2]],
    ]
  }
  const partidos: Array<[string, string]> = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      partidos.push([ids[i], ids[j]])
    }
  }
  return partidos
}

export function etiquetaCierreOficial(tipo: TipoCierreOficial | null | undefined, esWalkover?: boolean): string {
  if (tipo === 'retiro') return 'Retiro'
  if (tipo === 'walkover' || (!tipo && esWalkover)) return 'W.O.'
  return ''
}
