/**
 * Cuántos puntos se lleva cada jugador de un torneo, según dónde terminó.
 *
 * Reemplaza al sistema anterior, que pagaba por partido ganado y duplicaba por
 * ronda. Ahora paga el PUESTO FINAL: llegar segundo son 90 puntos, hayas ganado
 * los partidos que hayas ganado para llegar ahí.
 *
 * ── Por qué los puestos van en rangos ─────────────────────────────────────
 * En una llave de eliminación simple los dos que pierden en semifinales son
 * ambos 3°-4°, y los cuatro que pierden en cuartos son todos 5°-8°: nadie jugó
 * un partido que los ordene entre sí. Por eso comparten puntaje, en vez de
 * inventar un desempate que la cancha no dio.
 *
 * Si algún día se agrega el partido por el tercer lugar —el módulo de Torneo
 * Oficial ya lo tiene— acá se puede abrir 3° y 4° en dos filas distintas.
 */

/** Fases de la llave, de la más lejana a la final hacia la final. */
const ESCALERA = ['avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'final'] as const
type FaseLlave = (typeof ESCALERA)[number]

export type PuestoJugador = {
  /** Lo que se muestra: "1°", "3-4", "grupo". */
  etiqueta: string
  puntos: number
}

/**
 * El puesto que le queda a quien PERDIÓ en cada fase.
 *
 * Perder en 8vos deja noveno a decimosexto; perder en 16vos, del 17 al 32. La
 * cuenta sale de cuántos siguen vivos al entrar a esa ronda.
 */
const AL_PERDER: Record<FaseLlave, PuestoJugador> = {
  final:     { etiqueta: '2°',        puntos: 90 },
  semis:     { etiqueta: '3-4',       puntos: 80 },
  cuartos:   { etiqueta: '5-8',       puntos: 60 },
  '8vos':    { etiqueta: '9-16',      puntos: 20 },
  '16vos':   { etiqueta: '17-32',     puntos: 10 },
  // Un cuadro de 64 llega hasta acá. Del 33 en adelante la tabla del club no
  // sigue bajando, así que comparten el piso con la fase de grupos.
  '32vos':   { etiqueta: '33-64',     puntos: 9 },
  'avance':  { etiqueta: 'avance',    puntos: 9 },
}

export const PUNTOS_CAMPEON = 100
/** Jugó la fase de grupos y no pasó a la llave. Participar igual suma. */
export const PUNTOS_GRUPO = 9

/** Lo que se le muestra al usuario, en el orden en que conviene leerlo. */
export const TABLA_PUNTAJE: { puesto: string; puntos: number }[] = [
  { puesto: '1°',       puntos: PUNTOS_CAMPEON },
  { puesto: '2°',       puntos: AL_PERDER.final.puntos },
  { puesto: '3-4',      puntos: AL_PERDER.semis.puntos },
  { puesto: '5-8',      puntos: AL_PERDER.cuartos.puntos },
  { puesto: '9-16',     puntos: AL_PERDER['8vos'].puntos },
  { puesto: '17-32',    puntos: AL_PERDER['16vos'].puntos },
  { puesto: 'Fase de grupos', puntos: PUNTOS_GRUPO },
]

export type PartidoDelTorneo = {
  jugador_a: string
  jugador_b: string | null
  ganador: string | null
  fase: string | null
}

function esDeLlave(fase: string | null): fase is FaseLlave {
  return !!fase && (ESCALERA as readonly string[]).includes(fase)
}

/**
 * El puesto de cada jugador de UN torneo ya terminado.
 *
 * Se mira la fase más avanzada que jugó cada uno: en un torneo cerrado, quien
 * ganó su partido de cuartos jugó la semifinal, así que la ronda más lejos a
 * la que llegó es también donde quedó eliminado. La única excepción es la
 * final, donde hay que distinguir al que la ganó del que la perdió.
 *
 * Los partidos de `grupos` solo sirven para saber quién participó: el que no
 * aparece en ninguna fase de llave se fue en la fase de grupos.
 */
export function puestosDelTorneo(partidos: PartidoDelTorneo[]): Map<string, PuestoJugador> {
  const puestos = new Map<string, PuestoJugador>()
  const mejorFase = new Map<string, number>()
  const participantes = new Set<string>()
  let campeon: string | null = null

  for (const p of partidos) {
    // Un partido sin rival —un BYE— no es un partido jugado, pero sí dice que
    // esa persona estaba en el torneo.
    participantes.add(p.jugador_a)
    if (p.jugador_b) participantes.add(p.jugador_b)
    if (!esDeLlave(p.fase)) continue

    const nivel = ESCALERA.indexOf(p.fase)
    for (const jugador of [p.jugador_a, p.jugador_b]) {
      if (!jugador) continue
      if (nivel > (mejorFase.get(jugador) ?? -1)) mejorFase.set(jugador, nivel)
    }
    if (p.fase === 'final' && p.ganador) campeon = p.ganador
  }

  for (const jugador of participantes) {
    const nivel = mejorFase.get(jugador)
    if (nivel === undefined) {
      puestos.set(jugador, { etiqueta: 'grupo', puntos: PUNTOS_GRUPO })
      continue
    }
    if (jugador === campeon) {
      puestos.set(jugador, { etiqueta: '1°', puntos: PUNTOS_CAMPEON })
      continue
    }
    puestos.set(jugador, AL_PERDER[ESCALERA[nivel]])
  }

  return puestos
}
