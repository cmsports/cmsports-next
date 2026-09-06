// Marcador de tenis de mesa, compartido por Liga y Torneos.
// Vivía solo en `liga.ts`; Torneos lo necesita desde la migración 216, que le
// dio a `torneo_partidos` sus columnas `sets_a`/`sets_b`. Se movió acá en vez
// de importarlo desde `liga.ts` para que Torneos no dependa de Liga.
//
// Nació clavado en Mejor de Cinco. Desde la migración 262 cada torneo elige su
// formato —y por fase: los grupos pueden ir al mejor de 3 y la llave al mejor
// de 5, que es como se juega de verdad cuando hay que apurar los grupos—. La
// Liga sigue siendo Mejor de Cinco fija y por eso conserva sus funciones
// `...Bo5`, que ahora son la versión de este módulo con el formato fijado.

/** Lo único que distingue a un formato: cuántos sets hay que ganar. */
export type FormatoPartido = 'bo3' | 'bo5'

export const FORMATOS: ReadonlyArray<FormatoPartido> = ['bo3', 'bo5']

export const FORMATO_LABEL: Record<FormatoPartido, string> = {
  bo3: 'Mejor de 3',
  bo5: 'Mejor de 5',
}

/** Cómo se explica en pantalla, que es lo que el jugador necesita saber. */
export const FORMATO_EXPLICACION: Record<FormatoPartido, string> = {
  bo3: 'gana el primero que llega a 2 sets',
  bo5: 'gana el primero que llega a 3 sets',
}

export function setsParaGanar(formato: FormatoPartido): number {
  return formato === 'bo3' ? 2 : 3
}

/** Cuántos sets se pueden jugar como máximo: 3 en el bo3, 5 en el bo5. */
export function setsMaximos(formato: FormatoPartido): number {
  return setsParaGanar(formato) * 2 - 1
}

/** Normaliza lo que venga de la base a un formato conocido. */
export function formatoDe(valor: string | null | undefined): FormatoPartido {
  return valor === 'bo3' ? 'bo3' : 'bo5'
}

// HC-08: únicos marcadores válidos de un partido, en el orden en que se
// muestran los botones de la pantalla de torneos. La validación sale de esta
// misma lista para que no puedan quedar desalineadas: un botón que la UI
// ofrece siempre lo acepta el servidor.
export function marcadoresValidos(formato: FormatoPartido): ReadonlyArray<readonly [number, number]> {
  const meta = setsParaGanar(formato)
  const gana: Array<readonly [number, number]> = []
  const pierde: Array<readonly [number, number]> = []
  for (let perdidos = 0; perdidos < meta; perdidos++) {
    gana.push([meta, perdidos])
    pierde.push([perdidos, meta])
  }
  return [...gana, ...pierde]
}

export const MARCADORES_BO5 = marcadoresValidos('bo5')

export function esResultadoValido(setsA: number, setsB: number, formato: FormatoPartido): boolean {
  return marcadoresValidos(formato).some(([a, b]) => a === setsA && b === setsB)
}

export function esResultadoBo5Valido(setsA: number, setsB: number): boolean {
  return esResultadoValido(setsA, setsB, 'bo5')
}

/** El texto del error, con los marcadores que ese formato sí acepta. */
export function marcadoresPermitidosTexto(formato: FormatoPartido): string {
  return `Marcador inválido. Resultados permitidos en ${FORMATO_LABEL[formato]}: `
    + marcadoresValidos(formato).map(([a, b]) => `${a}-${b}`).join(', ')
}

export function determinarGanador(
  setsA: number,
  setsB: number,
  jugadorAId: string,
  jugadorBId: string,
): string {
  return setsA > setsB ? jugadorAId : jugadorBId
}

export const determinarGanadorBo5 = determinarGanador

// ─── Parciales (puntos set a set) ─────────────────────────────────────────
// El ratio de sets no alcanza para desempatar a tres en un grupo: dos que
// ganaron 3-1 y perdieron 1-3 quedan idénticos. El estándar baja entonces al
// ratio de PUNTOS, y para tenerlo hay que registrar el marcador de cada set.
//
// Al mejor de 3 esto pesa MÁS, no menos: con menos sets jugados hay menos
// información para separar, así que el triple empate es más frecuente y el
// ratio de puntos termina decidiendo más seguido.

/**
 * Un set válido llega a 11 con dos de ventaja. Con el perdedor en 9 o menos el
 * ganador tiene exactamente 11; desde 10 iguales (deuce) el set sigue hasta que
 * alguien saca dos: 12-10, 13-11, 20-18.
 */
export function esSetValido(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false
  const ganador = Math.max(a, b)
  const perdedor = Math.min(a, b)
  return perdedor <= 9 ? ganador === 11 : ganador === perdedor + 2
}

export interface ResumenBo5 {
  setsA: number
  setsB: number
  puntosA: number
  puntosB: number
}

/**
 * Convierte los parciales de un partido en sets y puntos totales, o devuelve
 * `null` si la secuencia no es un partido terminado de ese formato: algún set
 * inválido, nadie llegó a la meta, o hay sets cargados después de que el
 * partido ya estaba ganado.
 */
export function resumirPartido(
  parciales: ReadonlyArray<readonly [number, number]>,
  formato: FormatoPartido,
): ResumenBo5 | null {
  const meta = setsParaGanar(formato)
  if (parciales.length < meta || parciales.length > setsMaximos(formato)) return null
  let setsA = 0, setsB = 0, puntosA = 0, puntosB = 0
  for (const [a, b] of parciales) {
    if (setsA === meta || setsB === meta) return null // set de más: el partido ya estaba terminado
    if (!esSetValido(a, b)) return null
    puntosA += a
    puntosB += b
    if (a > b) setsA += 1
    else setsB += 1
  }
  if (setsA !== meta && setsB !== meta) return null
  return { setsA, setsB, puntosA, puntosB }
}

export function resumirBo5(
  parciales: ReadonlyArray<readonly [number, number]>,
): ResumenBo5 | null {
  return resumirPartido(parciales, 'bo5')
}
