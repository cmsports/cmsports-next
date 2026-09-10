// Eliminación directa con cuadro de consolación.
//
// El cuadro principal se arma desde la inscripción, sin fase de grupos. El que
// pierde temprano no se va a su casa: cae a un segundo cuadro que tiene su
// propio campeón.
//
// ── La promesa del formato, y cómo se traduce a código ─────────────────────
//
// El club lo pidió con una frase: "para que nadie juegue un solo partido". Todo
// lo de acá se subordina a eso.
//
// La formulación ingenua —"entran los perdedores de la primera ronda"— NO
// cumple la promesa, y falla justo con el jugador que menos se lo merece. En un
// cuadro de 16 con 11 inscritos hay 5 BYE: cinco sembrados que no juegan la
// primera ronda. Si uno de ellos pierde en la segunda, **jugó exactamente un
// partido y no entra, porque no perdió en primera**.
//
// Eso no da error, no lo caza ningún tipo y no se ve en ninguna pantalla: se ve
// el día del torneo.
//
// Por eso la regla no se escribe por ronda sino por lo que de verdad importa:
//
//     entra al cuadro de consuelo todo el que quede eliminado
//     habiendo jugado UN SOLO partido
//
// Formulada así no tiene casos raros y no depende de que el número de inscritos
// sea redondo.
//
// ── Por qué el conjunto queda cerrado al terminar la segunda ronda ─────────
//
// Después de la primera ronda quedan exactamente `tam/2` jugadores en un cuadro
// de `tam/2`, así que **en la segunda ronda ya no hay BYE**: juegan todos. De
// ahí sale que nadie puede llegar a la tercera ronda con un solo partido
// encima —quien tuvo BYE en la primera y ganó la segunda lleva uno, pero está
// vivo; si pierde la tercera, lleva dos—.
//
// O sea: al cerrarse la segunda ronda se conoce la lista COMPLETA de los que
// quedaron afuera con un partido, y recién ahí se puede armar el cuadro de
// consuelo entero de una vez, en vez de irlo parchando.

import {
  calcularTamanoBracket,
  construirBracketPorRanking,
  fasesParaMostrar,
  perdedorDePartido,
  siguienteFase,
  type JugadorTorneo,
  type PartidoGenerado,
  type RankeadoParaBracket,
} from './torneos'
import { CONFIG, type FaseOrden } from '../config'

/** Las fases del cuadro de consuelo, en el mismo orden que las del principal. */
export const FASES_CONSOLACION: Record<FaseOrden, string> = {
  avance: 'cons_avance',
  '128vos': 'cons_128vos',
  '64vos': 'cons_64vos',
  '32vos': 'cons_32vos',
  '16vos': 'cons_16vos',
  '8vos': 'cons_8vos',
  cuartos: 'cons_cuartos',
  semis: 'cons_semis',
  final: 'cons_final',
}

export const FASES_CONSOLACION_LISTA: ReadonlyArray<string> =
  CONFIG.FASES_ORDEN.map(f => FASES_CONSOLACION[f])

export function esFaseDeConsolacion(fase: string | null | undefined): boolean {
  return typeof fase === 'string' && fase.startsWith('cons_')
}

/** Cómo se llama cada fase de consuelo en pantalla. */
export const FASE_CONSOLACION_LABEL: Record<string, string> = {
  cons_avance: 'Consuelo · avance',
  cons_128vos: 'Consuelo · 128vos',
  cons_64vos: 'Consuelo · 64vos',
  cons_32vos: 'Consuelo · 32vos',
  cons_16vos: 'Consuelo · 16vos',
  cons_8vos: 'Consuelo · 8vos',
  cons_cuartos: 'Consuelo · cuartos',
  cons_semis: 'Consuelo · semifinal',
  cons_final: 'Final de consuelo',
}

/**
 * La fase que sigue, entienda o no de cuadros de consuelo.
 *
 * `siguienteFase()` recorre `CONFIG.FASES_ORDEN`, donde `cons_8vos` no existe:
 * devuelve `null` y el ganador nunca avanza. Un cuadro de consuelo con esa
 * propagación rota se ve como partidos que se juegan y no llevan a ninguna
 * parte — sin error, sin aviso.
 *
 * Esto traduce a la fase espejo: `cons_8vos` → `cons_cuartos`, y para las del
 * cuadro principal delega en la de siempre.
 */
export function siguienteFaseDeCualquierCuadro(fase: string | null | undefined): string | null {
  if (!fase) return null

  if (esFaseDeConsolacion(fase)) {
    const base = fase.slice('cons_'.length) as FaseOrden
    const sig = siguienteFase(base)
    return sig ? FASES_CONSOLACION[sig] : null
  }

  if (!(CONFIG.FASES_ORDEN as readonly string[]).includes(fase)) return null
  return siguienteFase(fase as FaseOrden)
}

/**
 * Ordena a los inscritos para sembrar el cuadro, sin fase de grupos.
 *
 * Primero las cabezas de serie en su número, después el resto en el orden en
 * que llegaron. `construirBracketPorRanking` espera exactamente eso: la lista
 * ordenada por mérito, donde el índice 0 es el mejor.
 *
 * ⚠️ **El `grupoIdx` único por jugador no es un relleno.** Esa función trae tres
 * ajustes heredados del torneo tradicional —separar por mitades al 1° y al 2°
 * de un mismo grupo, cruzar ganador contra segundo, y un backstop de choque—
 * que solo tienen sentido cuando los clasificados vienen de grupos. Dándole a
 * cada jugador su propio `grupoIdx` y `posicion: 1`, los tres no encuentran
 * nada que ajustar y se apagan solos, dejando la siembra bit-reversal pura.
 *
 * Eso permite reusar el armador de cuadro tal cual, sin bifurcarlo ni copiarlo.
 * `torneoConsolacion.test.ts` lo comprueba ejecutándolo, no suponiéndolo.
 */
export function ordenarParaCuadroDirecto(
  jugadores: readonly JugadorTorneo[],
  cabezas: readonly { jugadorId: string; numero: number }[] = [],
): RankeadoParaBracket[] {
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const numeroDe = new Map(cabezas.map(c => [c.jugadorId, c.numero]))

  const sembrados = [...cabezas]
    .sort((a, b) => a.numero - b.numero)
    .map(c => porId.get(c.jugadorId))
    .filter((j): j is JugadorTorneo => !!j)

  const yaSembrado = new Set(sembrados.map(j => j.id))
  const resto = jugadores.filter(j => !yaSembrado.has(j.id))

  return [...sembrados, ...resto].map((j, i) => ({
    jugadorId: j.id,
    nombre: j.nombre,
    // Único por jugador: apaga los tres ajustes de grupos (ver arriba).
    grupoIdx: i,
    posicion: 1 as const,
    cabezaNumero: numeroDe.get(j.id) ?? null,
  }))
}

/**
 * Las fases a mostrar, con el cuadro de consuelo DESPUÉS del principal.
 *
 * `fasesParaMostrar()` filtra contra `CONFIG.FASES_ORDEN`, así que las `cons_*`
 * se le caen: la pantalla mostraría partidos que existen en la base y no
 * aparecen en ninguna pestaña.
 *
 * El orden importa y es el mismo criterio con el que la 254 intercaló el tercer
 * lugar: primero se lee el camino principal completo, y después el consuelo,
 * porque es a donde se llega perdiendo.
 */
export function fasesParaMostrarConConsuelo(fasesPresentes: ReadonlySet<string>): string[] {
  const principales = fasesParaMostrar(fasesPresentes)
  const consuelo = FASES_CONSOLACION_LISTA.filter(f => fasesPresentes.has(f))
  return [...principales, ...consuelo]
}

/** El cuadro principal, desde la inscripción y sin pasar por grupos. */
export function generarCuadroDirecto(
  jugadores: readonly JugadorTorneo[],
  cabezas: readonly { jugadorId: string; numero: number }[] = [],
): PartidoGenerado[] {
  return construirBracketPorRanking(ordenarParaCuadroDirecto(jugadores, cabezas))
}

/**
 * Cuántas cabezas de serie admite un cuadro de `n` inscritos.
 *
 * El estándar es sembrar por potencias de 2 —2, 4, 8, 16— y nunca más de la
 * mitad del cuadro: sembrar a todos no es sembrar.
 *
 * ⚠️ Esto REEMPLAZA al tope del torneo tradicional ("una cabeza por grupo"),
 * que acá no significaría nada porque no hay grupos.
 */
export function maxCabezasDeCuadro(numJugadores: number): number {
  if (numJugadores < 4) return 0
  const tam = calcularTamanoBracket(numJugadores)
  let max = 2
  while (max * 2 <= tam / 2) max *= 2
  return Math.min(max, numJugadores)
}

export interface PartidoJugado {
  fase: string | null
  jugador_a: string | null
  jugador_b: string | null
  ganador: string | null
}

/**
 * Cuántos partidos JUGÓ cada uno en el cuadro principal.
 *
 * Un BYE no cuenta: la llave existe pero nadie jugó. `perdedorDePartido`
 * devuelve `null` en ese caso, y acá se filtra por tener los dos lados.
 */
export function partidosJugadosPorJugador(partidos: readonly PartidoJugado[]): Map<string, number> {
  const cuenta = new Map<string, number>()
  for (const p of partidos) {
    if (esFaseDeConsolacion(p.fase)) continue // solo cuenta el cuadro principal
    if (!p.jugador_a || !p.jugador_b || !p.ganador) continue
    for (const id of [p.jugador_a, p.jugador_b]) {
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1)
    }
  }
  return cuenta
}

/**
 * Quiénes van al cuadro de consuelo: los eliminados con UN SOLO partido.
 *
 * Devuelve los ids en el orden en que perdieron, que es el que después ordena
 * la siembra del cuadro de consuelo.
 */
export function elegiblesParaConsolacion(partidos: readonly PartidoJugado[]): string[] {
  const jugados = partidosJugadosPorJugador(partidos)
  const elegibles: string[] = []
  const vistos = new Set<string>()

  for (const p of partidos) {
    if (esFaseDeConsolacion(p.fase)) continue
    const perdedor = perdedorDePartido(p)
    if (!perdedor || vistos.has(perdedor)) continue
    if ((jugados.get(perdedor) ?? 0) !== 1) continue
    vistos.add(perdedor)
    elegibles.push(perdedor)
  }

  return elegibles
}

/**
 * Si ya se puede armar el cuadro de consuelo completo.
 *
 * Recién cuando las dos primeras rondas del cuadro principal están terminadas:
 * antes de eso la lista todavía puede crecer, y un cuadro armado a medias
 * dejaría afuera justo a los que la segunda ronda va a eliminar.
 */
export function consolacionLista(params: {
  partidos: readonly PartidoJugado[]
  faseInicial: FaseOrden
}): boolean {
  const orden = CONFIG.FASES_ORDEN
  const i = orden.indexOf(params.faseInicial)
  if (i < 0) return false

  const dosPrimeras = [orden[i], orden[i + 1]].filter(Boolean) as string[]
  const delCuadro = params.partidos.filter(p => p.fase && dosPrimeras.includes(p.fase))
  if (!delCuadro.length) return false

  // Una llave con un solo lado es un BYE: se da por resuelta sin jugarse.
  return delCuadro.every(p => {
    const esBye = !p.jugador_a || !p.jugador_b
    return esBye || !!p.ganador
  })
}

/**
 * El cuadro de consuelo, sembrado igual que el principal pero con sus fases.
 *
 * Devuelve los partidos con `fase` ya renombrada a `cons_*`, así el índice
 * único de `(torneo_id, fase, orden)` no puede chocar con el cuadro principal.
 */
export function generarCuadroConsolacion(
  jugadores: readonly JugadorTorneo[],
): PartidoGenerado[] {
  if (jugadores.length < 2) return []
  return generarCuadroDirecto(jugadores).map(p => ({
    ...p,
    fase: FASES_CONSOLACION[p.fase as FaseOrden] ?? `cons_${p.fase}`,
  }))
}
