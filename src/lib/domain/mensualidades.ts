// Cuánto se le debe cobrar a un jugador en el mes.
//
// Manda el monto ya emitido para ese mes; si no hay, la cuota que el profe le
// asignó. Y si tampoco tiene, no se inventa nada: devuelve null y la pantalla
// muestra "Cuota por asignar".
//
// Antes se estimaba por el plan de sesiones cuando faltaba la cuota. Era peor
// que dejarlo vacío: un monto inventado se ve igual de real que uno correcto,
// así que nadie lo revisa y termina cobrado. El profe define cada cuota a mano
// —hay de $7.000, de $30.000, de $50.000— y ninguna tabla puede adivinarlas.

type JugadorCuota = {
  mensualidad?: number | null
}

type CuotaEmitida = {
  monto?: number | null
} | null | undefined

/** El monto a cobrar, o null si nadie se lo asignó todavía. */
export function montoEsperado(jugador: JugadorCuota | null | undefined, cuota: CuotaEmitida): number | null {
  if (cuota?.monto) return Number(cuota.monto)
  if (jugador?.mensualidad) return Number(jugador.mensualidad)
  return null
}

export const SIN_CUOTA = 'Cuota por asignar'

/**
 * Lo que el profe escribió en un campo de monto, o null si dejó el campo vacío.
 *
 * Existe porque esta cuenta estaba copiada en cuatro pantallas y en tres de
 * ellas terminaba en `|| 30000` o `|| 0`: el campo vacío se convertía en un
 * monto. Vacío significa "todavía no le asignan cuota" y tiene que llegar así
 * hasta la base.
 */
export function montoIngresado(texto: string): number | null {
  const n = parseInt(texto, 10)
  return Number.isFinite(n) ? n : null
}
