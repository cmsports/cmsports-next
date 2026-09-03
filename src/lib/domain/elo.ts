/**
 * Índice de fuerza (Elo).
 *
 * ── Qué es, y qué NO reemplaza ──────────────────────────────────────────
 *
 * `rankingInterno.ts` premia el PUESTO alcanzado en cada torneo: 100 al
 * campeón, 90 al finalista, y nadie baja nunca. Esto es otra cosa: mide
 * FUERZA, sube y baja, y le importa contra quién jugaste, no en qué torneo.
 *
 * Son dos rankings con dos propósitos y conviven. El primero responde "quién
 * anduvo mejor esta temporada"; este, "quién le ganaría a quién". Reemplazar
 * uno por el otro rompe una de las dos preguntas.
 *
 * ── Por qué Elo y no Bradley-Terry ──────────────────────────────────────
 *
 * El club pidió que "cada resultado registrado actualice el índice". Elo se
 * actualiza partido a partido con dos números; Bradley-Terry es más justo pero
 * recalcula el historial entero cada vez. Ver §5.6 del plan.
 *
 * ── El invariante que caza casi todo ────────────────────────────────────
 *
 * **Con el mismo K, lo que uno gana el otro lo pierde, exactamente.** La suma
 * de todos los índices del club no se mueve nunca. Si se mueve, el cálculo
 * está mal, sin importar qué otra prueba pase.
 *
 * Por eso `actualizar()` calcula UN delta y lo aplica con signo opuesto, en vez
 * de calcular dos por separado: redondear dos veces haría que la suma se fuera
 * de a un punto por partido, y en un club con 140 jugadores eso se acumula
 * hasta que el número deja de significar nada.
 *
 * ⚠️ **Con K distintos la suma NO se conserva, y es a propósito.** El plan pide
 * un K mayor para las categorías menores, que es lo que hace que un juvenil que
 * mejora rápido llegue antes a su nivel real. Eso inyecta o drena puntos del
 * sistema — es una decisión conocida, la misma que toma la FIDE, no un error.
 * La prueba lo dice explícitamente para que nadie lo "arregle" después.
 *
 * ── Buin no se entera de nada de esto ───────────────────────────────────
 *
 * Todo cuelga del módulo `ranking_elo`, que solo tiene Spinhouse. Las claves de
 * `club_config` de acá son inertes sin ese módulo: nadie las lee.
 */

import type { LectorConfig } from './clubConfig'

/** Con cuánto arranca alguien que nunca jugó. */
export const ELO_INICIAL = 1500

export type Resultado = 'gana' | 'pierde' | 'walkover'

/**
 * La probabilidad de que A le gane a B, según la diferencia de índice.
 *
 * 400 puntos de diferencia = 10 a 1. Es la escala clásica y no se toca: es lo
 * que hace que un número de este sistema signifique lo mismo que en cualquier
 * otro que use Elo.
 */
export function esperado(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

/**
 * Cuánto se mueve el índice tras un partido.
 *
 * Devuelve el delta de A. El de B es el mismo con el signo cambiado **cuando
 * los dos usan el mismo K**, que es el caso normal.
 */
export function delta(params: {
  eloA: number
  eloB: number
  ganoA: boolean
  k: number
}): number {
  const { eloA, eloB, ganoA, k } = params
  return Math.round(k * ((ganoA ? 1 : 0) - esperado(eloA, eloB)))
}

/**
 * El índice de los dos después del partido.
 *
 * `kA`/`kB` son el K de cada uno: iguales salvo que uno sea de categoría menor.
 * Cuando coinciden —lo habitual— se calcula un solo delta y se aplica con signo
 * opuesto, así la suma del sistema queda intacta al punto.
 *
 * Un walkover no mueve nada por defecto: no se jugó, así que no hay evidencia
 * de fuerza que incorporar. Castigar la no presentación es una decisión
 * disciplinaria y va por los puntos de la liga, no por acá.
 */
export function actualizar(params: {
  eloA: number
  eloB: number
  resultado: Resultado
  kA: number
  kB?: number
  /** Si un walkover mueve el índice. Por defecto no. */
  cuentaWalkover?: boolean
}): { eloA: number; eloB: number; deltaA: number; deltaB: number } {
  const { eloA, eloB, resultado, kA, kB = kA, cuentaWalkover = false } = params

  if (resultado === 'walkover' && !cuentaWalkover) {
    return { eloA, eloB, deltaA: 0, deltaB: 0 }
  }

  const ganoA = resultado === 'gana'

  // El caso normal: un solo delta, suma conservada exactamente.
  if (kA === kB) {
    const d = delta({ eloA, eloB, ganoA, k: kA })
    return { eloA: eloA + d, eloB: eloB - d, deltaA: d, deltaB: -d }
  }

  // K distintos: cada uno se mueve según el suyo. La suma cambia, y eso es lo
  // que se pidió — ver la advertencia de arriba.
  const dA = delta({ eloA, eloB, ganoA, k: kA })
  const dB = delta({ eloA: eloB, eloB: eloA, ganoA: !ganoA, k: kB })
  return { eloA: eloA + dA, eloB: eloB + dB, deltaA: dA, deltaB: dB }
}

/**
 * El K que le toca a un jugador.
 *
 * Un K más alto mueve el índice más rápido. Los menores lo necesitan porque su
 * fuerza real cambia de mes a mes: con el K de un adulto, un juvenil que pegó
 * un salto tarda una temporada en que el número lo refleje.
 *
 * `esMenor` lo decide quien llama, desde la categoría por edad del jugador —
 * acá no se adivina a partir de un texto de categoría, que cambia por club.
 */
export function kDe(config: LectorConfig, esMenor: boolean): number {
  return esMenor ? config('elo.k_menores') : config('elo.k')
}

/** Una fila del historial, que es lo que dibuja la curva de la ficha. */
export type PasoElo = {
  fecha: string
  eloAntes: number
  eloDespues: number
  rivalId: string | null
  rivalElo: number
  resultado: Resultado
}

/**
 * Recorre los partidos en orden y devuelve el índice paso a paso.
 *
 * Se usa para dos cosas: importar el archivo histórico del club de una vez, y
 * recalcular cuando se corrige un resultado mal cargado. Sin esto, un partido
 * mal registrado en marzo queda contaminando el número para siempre.
 *
 * **El orden importa y es responsabilidad de quien llama.** Elo no es
 * conmutativo: los mismos partidos en otro orden dan otro número. Por eso
 * recibe una lista ya ordenada por fecha en vez de ordenarla acá con un
 * criterio que quizá no es el del club.
 */
export function recorrer(params: {
  inicial?: number
  partidos: readonly {
    fecha: string
    rivalId: string | null
    rivalElo: number
    resultado: Resultado
    k: number
    kRival?: number
    cuentaWalkover?: boolean
  }[]
}): { elo: number; jugados: number; pasos: PasoElo[] } {
  const { inicial = ELO_INICIAL, partidos } = params

  let elo = inicial
  let jugados = 0
  const pasos: PasoElo[] = []

  for (const p of partidos) {
    const antes = elo
    const r = actualizar({
      eloA: elo, eloB: p.rivalElo, resultado: p.resultado,
      kA: p.k, kB: p.kRival, cuentaWalkover: p.cuentaWalkover,
    })
    elo = r.eloA
    // Un walkover que no mueve el índice tampoco cuenta como partido jugado:
    // si contara, el promedio de partidos diría que alguien compitió cuando no
    // se presentó nadie.
    if (r.deltaA !== 0 || p.resultado !== 'walkover') jugados++
    pasos.push({
      fecha: p.fecha, eloAntes: antes, eloDespues: elo,
      rivalId: p.rivalId, rivalElo: p.rivalElo, resultado: p.resultado,
    })
  }

  return { elo, jugados, pasos }
}
