// Marcador de tenis de mesa a Mejor de Cinco, compartido por Liga y Torneos.
// Vivía solo en `liga.ts`; Torneos lo necesita desde la migración 216, que le
// dio a `torneo_partidos` sus columnas `sets_a`/`sets_b`. Se movió acá en vez
// de importarlo desde `liga.ts` para que Torneos no dependa de Liga.

// HC-08: únicos marcadores válidos en un partido Mejor de Cinco, en el orden
// en que se muestran los botones de la pantalla de torneos. La validación sale
// de esta misma lista para que no puedan quedar desalineadas: un botón que la
// UI ofrece siempre lo acepta el servidor.
export const MARCADORES_BO5: ReadonlyArray<readonly [number, number]> = [
  [3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3],
]

const RESULTADOS_BO5_VALIDOS = new Set(MARCADORES_BO5.map(([a, b]) => `${a}-${b}`))

export function esResultadoBo5Valido(setsA: number, setsB: number): boolean {
  return RESULTADOS_BO5_VALIDOS.has(`${setsA}-${setsB}`)
}

export function determinarGanadorBo5(
  setsA: number,
  setsB: number,
  jugadorAId: string,
  jugadorBId: string,
): string {
  return setsA > setsB ? jugadorAId : jugadorBId
}

// ─── Parciales (puntos set a set) ─────────────────────────────────────────
// El ratio de sets no alcanza para desempatar a tres en un grupo: dos que
// ganaron 3-1 y perdieron 1-3 quedan idénticos. El estándar baja entonces al
// ratio de PUNTOS, y para tenerlo hay que registrar el marcador de cada set.

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
 * `null` si la secuencia no es un Mejor de Cinco terminado: algún set inválido,
 * nadie llegó a 3, o hay sets cargados después de que el partido ya terminó.
 */
export function resumirBo5(
  parciales: ReadonlyArray<readonly [number, number]>,
): ResumenBo5 | null {
  if (parciales.length < 3 || parciales.length > 5) return null
  let setsA = 0, setsB = 0, puntosA = 0, puntosB = 0
  for (const [a, b] of parciales) {
    if (setsA === 3 || setsB === 3) return null // set de más: el partido ya estaba terminado
    if (!esSetValido(a, b)) return null
    puntosA += a
    puntosB += b
    if (a > b) setsA += 1
    else setsB += 1
  }
  if (setsA !== 3 && setsB !== 3) return null
  return { setsA, setsB, puntosA, puntosB }
}
