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
 * Cuántos partidos se juegan en cada fecha.
 *
 * Con el método del círculo todos juegan una vez por fecha, así que son la
 * mitad de los inscritos. Con un número impar, uno descansa.
 */
export function partidosPorFecha(numJugadores: number): number {
  return Math.floor(numJugadores / 2)
}

/**
 * Cuántas tandas de mesa ocupa una fecha.
 *
 * Es la traducción de "10 partidos por fecha" a algo que se pueda organizar:
 * con 4 mesas son 3 tandas, con 2 son 5. Sin esto, el club sabe cuántos
 * partidos hay pero no cuánto ocupa una jornada, que es lo que de verdad
 * necesita para decidir si el formato le sirve.
 *
 * Las mesas salen de `sede_mesas`, que ya existe desde la migración 251.
 *
 * ⚠️ Devuelve 0 si no hay mesas configuradas, y quien lo muestre tiene que
 * callarse en ese caso en vez de escribir "0 tandas": un club que no cargó sus
 * mesas no tiene el dato, y un cero ahí se lee como información cuando es
 * ausencia de información.
 */
export function tandasPorFecha(numJugadores: number, mesas: number): number {
  if (mesas <= 0) return 0
  return Math.ceil(partidosPorFecha(numJugadores) / mesas)
}

/**
 * Cuántos inscritos entran en una liguilla sin pasarse del tope de partidos.
 *
 * Los partidos crecen al cuadrado, así que el tope de inscritos cae rápido: con
 * 200 partidos son 20 jugadores a una rueda y solo 14 a ida y vuelta.
 *
 * Existe para que el aviso de "no cabe" diga qué SÍ cabe, en vez de dejar al
 * club adivinando cuántos sacar.
 */
export function maxJugadoresDeLiguilla(maxPartidos: number, ruedas: Ruedas = 1): number {
  let n = 2
  while (partidosDeLiguilla(n + 1, ruedas) <= maxPartidos) n++
  return n
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
