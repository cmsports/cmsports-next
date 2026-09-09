// Liguilla: todos contra todos, de una o dos ruedas.
//
// Es la modalidad más simple de explicar y la que menos código nuevo necesita:
// no hay grupos que repartir, no hay llave, no hay cabezas de serie —con todos
// contra todos la siembra no cambia un solo resultado— y la tabla de posiciones
// es la misma `calcularStatsGrupo` que ya usan los grupos.
//
// Lo único que sí hubo que escribir de cero es el CALENDARIO, y vale explicar
// por qué no alcanzaba con lo que había.
//
// ── Por qué no se reusa `generarRoundRobin` ────────────────────────────────
//
// `generarRoundRobin` (torneos.ts) es un doble bucle: con [A,B,C,D] devuelve
// AB, AC, AD, BC, BD, CD. Para un grupo de 3 o 4 da igual, porque se juegan
// todos casi a la vez en la misma mesa.
//
// En una liguilla de 12 ese mismo orden hace que **A juegue sus once partidos
// casi seguidos** y que el último jugador no toque una mesa hasta el final. No
// es un bug del round robin: es que ese orden nunca tuvo que servir como
// calendario.
//
// Acá se usa el **método del círculo**, que es como se arma un fixture de
// verdad: se reparte en RONDAS y en cada ronda todos juegan una vez. Con 12
// jugadores son 11 rondas de 6 partidos, y nadie juega dos veces seguidas.
//
// Con un número impar de jugadores se agrega un lugar fantasma: el que le toca
// enfrentarlo descansa esa ronda. Por eso las rondas son N cuando N es impar y
// N-1 cuando es par.

export interface PartidoLiguilla {
  jugadorA: string
  jugadorB: string
  /** Número de fecha, empezando en 1. Sirve para mostrar el calendario. */
  ronda: number
}

export type Ruedas = 1 | 2

/**
 * Cuántas rondas (fechas) tiene una liguilla.
 *
 * Con N par son N-1; con N impar son N, porque en cada una descansa alguien.
 */
export function rondasDeLiguilla(numJugadores: number, ruedas: Ruedas = 1): number {
  if (numJugadores < 2) return 0
  const posiciones = numJugadores % 2 === 0 ? numJugadores : numJugadores + 1
  return (posiciones - 1) * ruedas
}

/**
 * Cuántos partidos se van a jugar en total.
 *
 * Se muestra ANTES de cerrar la inscripción, y no es un adorno: doce jugadores
 * a dos ruedas son 132 partidos, que a veinte minutos cada uno y cuatro mesas
 * son once horas de mesa. Un club que elige "ida y vuelta" sin ver el número se
 * entera el día del torneo.
 */
export function partidosDeLiguilla(numJugadores: number, ruedas: Ruedas = 1): number {
  if (numJugadores < 2) return 0
  return (numJugadores * (numJugadores - 1) / 2) * ruedas
}

/**
 * El calendario completo, por rondas.
 *
 * Método del círculo: se fija al primero y se rota al resto. En cada ronda se
 * empareja la posición `i` con la `n-1-i`.
 *
 * La segunda rueda son los mismos cruces **con los lados invertidos**: en tenis
 * de mesa no hay localía, pero `jugador_a` es quien saca primero, así que
 * invertir es lo que hace que la vuelta no sea una repetición exacta de la ida.
 */
export function generarLiguilla(
  jugadorIds: readonly string[],
  ruedas: Ruedas = 1,
): PartidoLiguilla[] {
  const ids = [...jugadorIds]
  if (ids.length < 2) return []

  // El lugar fantasma para un número impar: a quien le toque, descansa.
  const DESCANSA = null
  const rueda: Array<string | null> = ids.length % 2 === 0 ? [...ids] : [...ids, DESCANSA]
  const n = rueda.length
  const rondasPorRueda = n - 1
  const mitad = n / 2

  const ida: PartidoLiguilla[] = []
  for (let r = 0; r < rondasPorRueda; r++) {
    for (let i = 0; i < mitad; i++) {
      const a = rueda[i]
      const b = rueda[n - 1 - i]
      if (a === DESCANSA || b === DESCANSA) continue
      // Alternar el lado según la ronda reparte quién saca primero: si no, el
      // que quedó fijo en la posición 0 sacaría primero en todos sus partidos.
      const inverso = r % 2 === 1
      ida.push({
        jugadorA: inverso ? b : a,
        jugadorB: inverso ? a : b,
        ronda: r + 1,
      })
    }
    // Rotar dejando el primero quieto: el último pasa a la segunda posición.
    const ultimo = rueda.pop()!
    rueda.splice(1, 0, ultimo)
  }

  if (ruedas === 1) return ida

  const vuelta = ida.map(p => ({
    jugadorA: p.jugadorB,
    jugadorB: p.jugadorA,
    ronda: p.ronda + rondasPorRueda,
  }))
  return [...ida, ...vuelta]
}
