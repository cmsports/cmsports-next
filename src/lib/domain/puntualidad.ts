// Comportamiento de pago: quién paga en plazo, quién atrasado, a quién se le
// regaló un mes.
//
// El dato NO se deduce de `fecha_pago`. Esa fecha dice cuándo el admin registró
// el pago, no cuándo el jugador pagó: el admin que se pone al día el 20 con lo
// cobrado la primera semana marcaría atrasado a todo el club. Lo declara quien
// cobra, al cobrar (migración 234).
//
// Acá solo hay lectura: contar, armar la racha y ponerle nombre. Escribir es
// del RPC.

/**
 * El motivo con el que se exime una cuota como premio.
 *
 * Un mes gratis no es un estado nuevo: es una exención (migración 203) con este
 * texto en `notas`. Distinguirlo por el motivo y no por una columna propia es
 * lo más chico que funciona, y tiene un techo: si alguien edita el motivo a
 * mano, el premio deja de contarse. Si algún día hay que reportarlos en serio,
 * conviene una columna `tipo_exencion`.
 */
export const MOTIVO_MES_GRATIS = 'Mes gratis por buen comportamiento'

export type CuotaPuntualidad = {
  mes: number
  anio: number
  estado?: string | null
  puntualidad?: string | null
  notas?: string | null
}

export function esMesGratis(cuota: CuotaPuntualidad | null | undefined): boolean {
  return cuota?.estado === 'exento' && cuota?.notas === MOTIVO_MES_GRATIS
}

export type Resumen = {
  aTiempo: number
  atrasado: number
  /** Cuotas cobradas a las que nadie les puso la etiqueta. */
  sinMarcar: number
  mesesGratis: number
  /** Meses seguidos pagando en plazo, contando desde el más reciente. */
  racha: number
}

/** Ordena de más nuevo a más viejo. */
function masNuevoPrimero(a: CuotaPuntualidad, b: CuotaPuntualidad): number {
  return b.anio - a.anio || b.mes - a.mes
}

/**
 * Todo lo que hay que saber del historial de pago de un jugador.
 *
 * La racha se corta con un atrasado y con nada más. Un mes pendiente todavía no
 * está resuelto, y un mes gratis es un premio: cortar la racha por cualquiera de
 * los dos sería castigar por algo que no pasó. Un pago sin etiquetar tampoco la
 * corta —no se sabe— pero tampoco la suma, así que una racha larga siempre está
 * hecha de meses realmente marcados en plazo.
 */
export function resumenPuntualidad(cuotas: CuotaPuntualidad[]): Resumen {
  const r: Resumen = { aTiempo: 0, atrasado: 0, sinMarcar: 0, mesesGratis: 0, racha: 0 }

  for (const c of cuotas) {
    if (esMesGratis(c)) r.mesesGratis++
    else if (c.estado !== 'pagado') continue
    else if (c.puntualidad === 'a_tiempo') r.aTiempo++
    else if (c.puntualidad === 'atrasado') r.atrasado++
    else r.sinMarcar++
  }

  for (const c of [...cuotas].sort(masNuevoPrimero)) {
    if (c.estado === 'pagado' && c.puntualidad === 'atrasado') break
    if (c.estado === 'pagado' && c.puntualidad === 'a_tiempo') r.racha++
  }

  return r
}

/** Cómo se lee la etiqueta de una cuota en la tabla. */
export function etiquetaPuntualidad(cuota: CuotaPuntualidad | null | undefined): string | null {
  if (esMesGratis(cuota)) return '🎁 Mes gratis'
  if (cuota?.estado !== 'pagado') return null
  if (cuota.puntualidad === 'a_tiempo') return '🟢 En plazo'
  if (cuota.puntualidad === 'atrasado') return '🔴 Atrasado'
  return '⚪ Sin marcar'
}
