/**
 * Planes de mensualidad: la cuota sale de una tarifa, no de un monto suelto.
 *
 * ── Cuándo se usa y cuándo no ───────────────────────────────────────────
 *
 * Solo cuando el club puso `mensualidad.modo = 'por_plan'`. El default es
 * `'monto_libre'`, que es como funciona Buin: cada cuota es un acuerdo por
 * persona y `mensualidades.ts` explica por qué ninguna tabla puede adivinarlas.
 *
 * En Spinhouse la cuota sale de una tarifa publicada —frecuencia semanal por
 * tipo de clase— y mantener eso a mano en 140 fichas garantiza que se
 * desactualice.
 *
 * ── La regla que impide inventar plata ──────────────────────────────────
 *
 * Un jugador sin plan en un club `por_plan` **no cae al plan más barato ni a un
 * valor razonable**: su cuota queda sin monto y la pantalla lo muestra. Un
 * monto inventado se ve igual de real que uno correcto, así que nadie lo revisa
 * y termina cobrado. Es la lección de la migración 097.
 */

import type { LectorConfig } from './clubConfig'

export type Plan = {
  id: string
  nombre: string
  frecuencia_semanal: number | null
  tipo_clase: string | null
  monto: number
  vigente_desde: string | null
  vigente_hasta: string | null
  activo: boolean
}

/** Si el club cobra por plan o con un monto por persona. */
export function cobraPorPlan(config: LectorConfig): boolean {
  return config('mensualidad.modo') === 'por_plan'
}

/**
 * Si el plan se puede contratar en esa fecha.
 *
 * `vigente_hasta` es el último día en que se vendió, inclusive — misma
 * semántica que en el resto del proyecto, donde cerrar una vigencia se hace con
 * la fecha de ayer y no la de hoy.
 */
export function planVigente(plan: Plan, fechaISO: string): boolean {
  if (!plan.activo) return false
  if (plan.vigente_desde && fechaISO < plan.vigente_desde) return false
  if (plan.vigente_hasta && fechaISO > plan.vigente_hasta) return false
  return true
}

/** Los planes que se pueden contratar hoy, del más barato al más caro. */
export function planesVigentes(planes: readonly Plan[], fechaISO: string): Plan[] {
  return planes.filter(p => planVigente(p, fechaISO)).sort((a, b) => a.monto - b.monto)
}

/**
 * Cuánto se le cobra a un jugador este mes.
 *
 * El orden importa y es el mismo que aplica `generar_mensualidades` en la base:
 *
 *   1. **Lo ya emitido para ese mes.** La plata de un mes cerrado no cambia:
 *      subirle el precio al plan en marzo no puede reescribir la cuota de
 *      febrero.
 *   2. **La tarifa de su plan**, si el club cobra por plan.
 *   3. **Su monto propio**, que es el único camino en un club de monto libre y
 *      además el escape para el jugador con un acuerdo especial.
 *   4. **`null`.** No se inventa nada.
 */
export function montoDelJugador(params: {
  config: LectorConfig
  emitido?: number | null
  plan?: Plan | null
  mensualidadPropia?: number | null
}): number | null {
  const { config, emitido, plan, mensualidadPropia } = params

  if (emitido) return Number(emitido)
  if (cobraPorPlan(config) && plan?.monto) return Number(plan.monto)
  if (mensualidadPropia) return Number(mensualidadPropia)
  return null
}

/**
 * Por qué el jugador paga lo que paga, para mostrarlo al lado del monto.
 *
 * Sin esto, dos jugadores del mismo grupo con cuotas distintas parecen un error
 * de la aplicación, y alguien "arregla" el que estaba bien.
 */
export function origenDelMonto(params: {
  config: LectorConfig
  emitido?: number | null
  plan?: Plan | null
  mensualidadPropia?: number | null
}): 'emitido' | 'plan' | 'propio' | 'sin_asignar' {
  const { config, emitido, plan, mensualidadPropia } = params

  if (emitido) return 'emitido'
  if (cobraPorPlan(config) && plan?.monto) return 'plan'
  if (mensualidadPropia) return 'propio'
  return 'sin_asignar'
}

/** Cómo se llama un plan en pantalla, con su frecuencia si la tiene. */
export function etiquetaPlan(plan: Plan): string {
  if (!plan.frecuencia_semanal) return plan.nombre
  const veces = plan.frecuencia_semanal === 1
    ? '1 vez por semana'
    : `${plan.frecuencia_semanal} veces por semana`
  return `${plan.nombre} · ${veces}`
}

/**
 * Si el plan alcanza para la cantidad de bloques en que está inscrito.
 *
 * Es la validación 7 de la toma de bloques: un plan de dos veces por semana no
 * puede sostener tres grupos. Devuelve `null` cuando el plan no declara
 * frecuencia —hay planes libres— porque entonces no hay nada que comprobar.
 */
export function alcanzaLaFrecuencia(
  plan: Plan | null | undefined,
  bloquesInscritos: number,
): { ok: true } | { ok: false; motivo: string } | null {
  if (!plan?.frecuencia_semanal) return null
  if (bloquesInscritos <= plan.frecuencia_semanal) return { ok: true }

  return {
    ok: false,
    motivo: `Su plan es de ${plan.frecuencia_semanal} ${plan.frecuencia_semanal === 1 ? 'vez' : 'veces'} por semana y quedaría en ${bloquesInscritos} grupos.`,
  }
}
