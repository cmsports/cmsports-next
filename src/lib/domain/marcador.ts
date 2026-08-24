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
