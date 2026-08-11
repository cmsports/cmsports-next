/**
 * Clasificación de grupos según Manual del Juez General ITTF:
 * - Ganador: 2 puntos
 * - Perdedor de partido jugado/completo: 1 punto
 * - Perdedor W.O. / partido no completado: 0 puntos
 * Desempates solo entre empatados: pts → ratio juegos → ratio puntos.
 */

export type SetMarcador = [number, number]

export interface PartidoOficialStats {
  inscritoA: string
  inscritoB: string
  ganador: string | null
  sets?: SetMarcador[]
  esWalkover?: boolean
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
