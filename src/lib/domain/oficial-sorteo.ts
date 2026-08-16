/**
 * Sorteo / siembra de cuadro y numeración ITTF para torneo oficial (§3.2–3.7, §4.5).
 * Encaja sobre el layout actual (grupos → 1°/2° → llaves) sin reescribir el motor.
 */

import {
  calcularTamanoBracket,
  determinarFaseInicial,
  type LlaveMatch,
  type LlavesLayout,
} from '@/lib/domain/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'

/** Modos de emparejamiento 2ª fase (§3.7 / Apéndice C). */
export type ModoSorteoLlave = 'fijo' | 'sorteo_segundos' | 'serpiente'

export const MODO_SORTEO_LLAVE_LABEL: Record<ModoSorteoLlave, string> = {
  fijo: 'Fijo (1° × 2° otro grupo, con semillas)',
  sorteo_segundos: 'Sorteo de 2.os (1.os fijos, 2.os al azar)',
  serpiente: 'Serpiente (A1–último2, B1–…)',
}

export function esModoSorteoLlave(v: unknown): v is ModoSorteoLlave {
  return v === 'fijo' || v === 'sorteo_segundos' || v === 'serpiente'
}

/** Posiciones de sembrado ITTF (bit-reversal): índice = semilla-1 → slot 0..tam-1. */
export function posicionesSemillaIttf(tam: number): number[] {
  if (tam < 2 || (tam & (tam - 1)) !== 0) return []
  let rondas = [1]
  while (rondas.length < tam) {
    const m = rondas.length * 2
    const next: number[] = []
    for (const s of rondas) {
      next.push(s)
      next.push(m + 1 - s)
    }
    rondas = next
  }
  const posiciones = Array(tam + 1).fill(0)
  rondas.forEach((seed, pos) => {
    posiciones[seed] = pos
  })
  return posiciones.slice(1)
}

export type ResumenSiembraCuadro = {
  clasificados: number
  tamanoLlave: number
  byes: number
  faseInicial: FaseOrden
  /** Slot (0-based) por número de semilla 1..tamano. */
  posicionesSemilla: number[]
  /**
   * En este módulo la «previa» es la fase de grupos.
   * Una ronda preliminar aparte (lucky loser / cut) no aplica sin reescritura.
   */
  previasViaGrupos: true
}

/** Resumen formal del cuadro a partir de cupos clasificados (1°+2° por grupo). */
export function resumenSiembraCuadro(numClasificados: number): ResumenSiembraCuadro | null {
  if (numClasificados < 2) return null
  const tamanoLlave = calcularTamanoBracket(numClasificados)
  return {
    clasificados: numClasificados,
    tamanoLlave,
    byes: tamanoLlave - numClasificados,
    faseInicial: determinarFaseInicial(tamanoLlave),
    posicionesSemilla: posicionesSemillaIttf(tamanoLlave),
    previasViaGrupos: true,
  }
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

/**
 * Reasigna los 2.os de grupo al azar en los cupos B del layout fijo,
 * sin enfrentar al 1° y 2° del mismo grupo (§3.7 sorteo de segundos).
 */
export function aplicarSorteoSegundos(
  layout: LlavesLayout,
  rng: () => number = Math.random,
): LlavesLayout {
  const indices: number[] = []
  const pool: Array<{ grupoIdx: number; pos: 1 | 2 }> = []
  for (let i = 0; i < layout.matches.length; i++) {
    const b = layout.matches[i].b
    if (b && b.pos === 2) {
      indices.push(i)
      pool.push({ ...b })
    }
  }
  if (pool.length < 2) return layout

  const maxIntentos = 40
  for (let intento = 0; intento < maxIntentos; intento++) {
    const candidato = [...pool]
    shuffleInPlace(candidato, rng)
    let ok = true
    const matches: LlaveMatch[] = layout.matches.map(m => ({ ...m, a: m.a ? { ...m.a } : null, b: m.b ? { ...m.b } : null }))
    for (let k = 0; k < indices.length; k++) {
      const mi = indices[k]
      const a = matches[mi].a
      const b = candidato[k]
      if (a && a.grupoIdx === b.grupoIdx) {
        ok = false
        break
      }
      matches[mi] = { ...matches[mi], b }
    }
    if (ok) return { ...layout, matches }
  }
  // Si no hay permutación válida (muy raro), devolver layout original.
  return layout
}

/**
 * Serpiente: conserva esqueleto/BYEs del layout fijo y reasigna 2.os
 * en orden inverso de grupo frente a los 1.os (A1×último2, B1×…).
 */
export function aplicarSerpienteSegundos(layout: LlavesLayout): LlavesLayout {
  const indices: number[] = []
  const pool: Array<{ grupoIdx: number; pos: 1 | 2 }> = []
  for (let i = 0; i < layout.matches.length; i++) {
    const b = layout.matches[i].b
    if (b && b.pos === 2) {
      indices.push(i)
      pool.push({ ...b })
    }
  }
  if (pool.length < 2) return layout

  const order = [...indices].sort((ia, ib) => {
    const ga = layout.matches[ia].a?.grupoIdx ?? 0
    const gb = layout.matches[ib].a?.grupoIdx ?? 0
    return ga - gb
  })
  pool.sort((a, b) => b.grupoIdx - a.grupoIdx)

  const used = new Set<number>()
  const matches: LlaveMatch[] = layout.matches.map(m => ({
    ...m,
    a: m.a ? { ...m.a } : null,
    b: m.b ? { ...m.b } : null,
  }))

  for (const mi of order) {
    const a = matches[mi].a
    const pick = pool.findIndex((s, idx) => !used.has(idx) && (!a || s.grupoIdx !== a.grupoIdx))
    if (pick < 0) continue
    used.add(pick)
    matches[mi] = { ...matches[mi], b: pool[pick] }
  }
  return { ...layout, matches }
}

/**
 * Aplica el modo de sorteo 2ª fase sobre un layout base (fijo con semillas/BYEs).
 * `numGrupos` se conserva por API; serpiente y sorteo operan sobre el esqueleto.
 */
export function aplicarModoSorteoLlave(
  modo: ModoSorteoLlave,
  layoutBase: LlavesLayout,
  _numGrupos: number,
  rng: () => number = Math.random,
): LlavesLayout {
  if (modo === 'fijo') return layoutBase
  if (modo === 'serpiente') return aplicarSerpienteSegundos(layoutBase)
  return aplicarSorteoSegundos(layoutBase, rng)
}

const FASES_NUM: readonly string[] = [
  'grupos',
  'avance',
  '32vos',
  '16vos',
  '8vos',
  'cuartos',
  'semis',
  'tercer_lugar',
  'final',
]

export type PartidoParaNumerar = {
  id: string
  fase: string
  orden: number
  /** Orden del grupo (solo fase grupos). */
  grupoOrden?: number | null
}

/** Numeración consecutiva ITTF/Koidan para programa y export (§4.5). */
export function asignarNumerosIttf(partidos: PartidoParaNumerar[]): Map<string, number> {
  const ordenados = [...partidos].sort((a, b) => {
    const fa = FASES_NUM.indexOf(a.fase)
    const fb = FASES_NUM.indexOf(b.fase)
    const ia = fa >= 0 ? fa : 99
    const ib = fb >= 0 ? fb : 99
    if (ia !== ib) return ia - ib
    if (a.fase === 'grupos') {
      const ga = a.grupoOrden ?? 0
      const gb = b.grupoOrden ?? 0
      if (ga !== gb) return ga - gb
    }
    return a.orden - b.orden
  })
  const out = new Map<string, number>()
  ordenados.forEach((p, i) => out.set(p.id, i + 1))
  return out
}

export function etiquetaNumeroIttf(n: number | null | undefined): string {
  if (n == null || n < 1) return ''
  return `#${n}`
}

/** Etiqueta corta de fase para programa (alineada a export). */
export function etiquetaFaseCorta(fase: string): string {
  const labels = CONFIG.FASE_LABELS as Record<string, string>
  return labels[fase] || fase
}

export const TAMANOS_CUADRO = [8, 16, 32, 64] as const
export type TamanoCuadro = (typeof TAMANOS_CUADRO)[number]

export function esTamanoCuadro(v: unknown): v is TamanoCuadro {
  return v === 8 || v === 16 || v === 32 || v === 64
}

export type PlanPreLlave = {
  tamanoCuadro: number
  numGrupos: number
  partidosAvance: number
  segundosDirectos: number
  segundosEnAvance: number
}

/**
 * Si 2×grupos no cabe en el cuadro, los 2.os de más abajo juegan `avance`.
 * Cada partido de avance elimina a uno; los ganadores llenan los cupos que faltan.
 */
export function planificarPreLlave(numGrupos: number, tamanoCuadro: number): PlanPreLlave | { error: string } | null {
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }
  if (!esTamanoCuadro(tamanoCuadro)) return { error: 'El cuadro debe ser 8, 16, 32 o 64' }
  const clasificados = numGrupos * 2
  if (clasificados <= tamanoCuadro) return null
  const extra = clasificados - tamanoCuadro
  const enAvance = extra * 2
  if (enAvance > numGrupos) {
    return { error: `El cuadro de ${tamanoCuadro} es chico para ${numGrupos} grupos. Sube el tamaño o forma menos grupos.` }
  }
  return {
    tamanoCuadro,
    numGrupos,
    partidosAvance: extra,
    segundosDirectos: numGrupos - enAvance,
    segundosEnAvance: enAvance,
  }
}

export type LadoCuadro = {
  grupoIdx: number | null
  pos: 1 | 2
  avanceOrden: number | null
}

export type CruceCuadro = {
  orden: number
  a: LadoCuadro
  b: LadoCuadro
}

function ladoVacio(): LadoCuadro {
  return { grupoIdx: null, pos: 2, avanceOrden: null }
}

/**
 * Semillas 1..G en posiciones ITTF; el resto, 2.os directos y cupos de avance.
 */
export function colocarCuadroConPreLlave(plan: PlanPreLlave): CruceCuadro[] {
  const T = plan.tamanoCuadro
  const G = plan.numGrupos
  const posSemilla = posicionesSemillaIttf(T)
  const lados: LadoCuadro[] = Array.from({ length: T }, () => ladoVacio())

  for (let seed = 1; seed <= G; seed++) {
    const pos = posSemilla[seed - 1]
    if (pos == null || pos < 0 || pos >= T) continue
    lados[pos] = { grupoIdx: seed - 1, pos: 1, avanceOrden: null }
  }

  const pool: LadoCuadro[] = [
    ...Array.from({ length: plan.segundosDirectos }, (_, i) => ({
      grupoIdx: i,
      pos: 2 as const,
      avanceOrden: null,
    })),
    ...Array.from({ length: plan.partidosAvance }, (_, i) => ({
      grupoIdx: null,
      pos: 2 as const,
      avanceOrden: i,
    })),
  ]

  const vacios = lados.map((_, i) => i).filter(i => lados[i].grupoIdx == null && lados[i].avanceOrden == null)
  const usados = new Set<number>()
  for (const pos of vacios) {
    const rival = lados[pos ^ 1]
    let idx = pool.findIndex((p, k) =>
      !usados.has(k)
      && (p.grupoIdx == null || p.grupoIdx !== rival.grupoIdx)
      && !(p.avanceOrden != null && rival.avanceOrden != null),
    )
    if (idx < 0) {
      idx = pool.findIndex((p, k) =>
        !usados.has(k) && (p.grupoIdx == null || p.grupoIdx !== rival.grupoIdx),
      )
    }
    if (idx < 0) idx = pool.findIndex((_, k) => !usados.has(k))
    if (idx < 0) continue
    usados.add(idx)
    lados[pos] = pool[idx]
  }

  const matches: CruceCuadro[] = []
  for (let orden = 0; orden < T / 2; orden++) {
    matches.push({ orden, a: lados[orden * 2], b: lados[orden * 2 + 1] })
  }
  return matches
}

