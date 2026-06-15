import { CONFIG } from '../config'

export interface FinanzasResumen {
  ingresos: number
  gastos: number
  balance: number
}

export interface DesglosePorCategoria {
  ingresos: Record<string, number>
  gastos: Record<string, number>
}

export interface KpisFinancieros {
  coa: number
  tasaMorosidad: number
  margenPorAlumno: number
  proyeccionIngresos: number
}

export function calcularResumen(
  movimientos: Array<{ tipo: string; monto: number }>,
): FinanzasResumen {
  let ingresos = 0
  let gastos = 0

  for (const m of movimientos) {
    if (m.tipo === 'ingreso') ingresos += m.monto
    else gastos += m.monto
  }

  return { ingresos, gastos, balance: ingresos - gastos }
}

export function calcularDesglose(
  movimientos: Array<{ tipo: string; categoria: string; monto: number }>,
): DesglosePorCategoria {
  const ingresos: Record<string, number> = {}
  const gastos: Record<string, number> = {}

  for (const m of movimientos) {
    const target = m.tipo === 'ingreso' ? ingresos : gastos
    target[m.categoria] = (target[m.categoria] || 0) + m.monto
  }

  return { ingresos, gastos }
}

export function calcularCOA(gastosTotales: number, jugadoresActivos: number): number {
  if (jugadoresActivos === 0) return 0
  return Math.round(gastosTotales / jugadoresActivos)
}

export function calcularTasaMorosidad(morosos: number, totalJugadores: number): number {
  if (totalJugadores === 0) return 0
  return Math.round((morosos / totalJugadores) * 100)
}

export function calcularMargenPorAlumno(
  ingresosTotales: number,
  gastosTotales: number,
  jugadoresActivos: number,
): number {
  if (jugadoresActivos === 0) return 0
  return Math.round((ingresosTotales - gastosTotales) / jugadoresActivos)
}

export function calcularProyeccionIngresos(
  jugadoresActivos: number,
  mensualidadBase: number = CONFIG.MENSUALIDAD_BASE,
): number {
  return jugadoresActivos * mensualidadBase
}

export function calcularKpis(
  movimientos: Array<{ tipo: string; monto: number }>,
  jugadoresActivos: number,
  morosos: number,
  mensualidadBase: number = CONFIG.MENSUALIDAD_BASE,
): KpisFinancieros {
  const { ingresos, gastos } = calcularResumen(movimientos)
  return {
    coa: calcularCOA(gastos, jugadoresActivos),
    tasaMorosidad: calcularTasaMorosidad(morosos, jugadoresActivos),
    margenPorAlumno: calcularMargenPorAlumno(ingresos, gastos, jugadoresActivos),
    proyeccionIngresos: calcularProyeccionIngresos(jugadoresActivos, mensualidadBase),
  }
}

export function montoPorPlan(sesionesLimite: number): number {
  const plan = CONFIG.PLANES.find(p => p.sesiones === sesionesLimite)
  return plan?.monto ?? CONFIG.MENSUALIDAD_BASE
}

export function formatCLP(monto: number | null | undefined): string {
  return '$' + (monto ?? 0).toLocaleString('es-CL')
}
