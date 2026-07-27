// Cuánto se le debe cobrar a un jugador en el mes.
//
// Mismo criterio que la base de datos al emitir la cuota (migración 039):
// manda el monto ya emitido para ese mes, después la mensualidad del jugador,
// y solo si no hay ninguno se estima por el plan.
//
// El modal de "Marcar pagado" estimaba siempre por el plan e ignoraba la
// mensualidad real: un jugador de $25.000 con un plan fuera de 8/12/16
// sesiones caía al último caso y se le registraban $15.000.

const MONTO_POR_PLAN: Record<number, number> = {
  4: 15000,
  8: 25000,
  12: 30000,
  16: 40000,
}

const MONTO_POR_DEFECTO = 25000

type JugadorCuota = {
  mensualidad?: number | null
  sesiones_limite?: number | null
}

type CuotaEmitida = {
  monto?: number | null
} | null | undefined

export function montoEsperado(jugador: JugadorCuota | null | undefined, cuota: CuotaEmitida): number {
  if (cuota?.monto) return Number(cuota.monto)
  if (jugador?.mensualidad) return Number(jugador.mensualidad)
  const porPlan = jugador?.sesiones_limite != null ? MONTO_POR_PLAN[jugador.sesiones_limite] : undefined
  return porPlan ?? MONTO_POR_DEFECTO
}
