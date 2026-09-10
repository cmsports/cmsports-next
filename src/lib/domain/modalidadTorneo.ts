// Catálogo único de las modalidades de torneo.
//
// Hasta la migración 264 había una sola forma de correr un torneo —fase de
// grupos y después la llave— y no tenía nombre porque no hacía falta: era "el
// torneo". Spinhouse pidió tres formas más, así que la que existía pasa a
// llamarse `grupos` (el torneo tradicional) y es una de cuatro.
//
// `torneos.formato` ya guardaba 'grupos' en todas las filas desde siempre
// —`crearTorneo` la escribía fija y nadie la leía—, así que la columna no hubo
// que crearla ni rellenarla: solo declarar qué valores valen.
//
// ── Lo que protege a Buin ──────────────────────────────────────────────────
//
// `grupos` es el default en la base y acá. Un torneo que no elija nada, o uno
// creado antes de que esto existiera, es el tradicional y se comporta igual que
// siempre. Y ninguna función de este archivo sabe qué club la llama: la
// modalidad es un dato del torneo, no una configuración del club. Lo único que
// depende del club es si el SELECTOR aparece, y eso lo deciden los módulos.
//
// ── Por qué `modalidadesDisponibles` es una sola función ───────────────────
//
// Es el mismo principio que `marcadoresValidos()` en marcador.ts: la lista que
// pinta los botones y la lista contra la que valida el servidor tienen que ser
// LA MISMA, o se desalinean. Una UI que ofrece una opción que la Action
// rechaza es un botón que da error, y una Action más permisiva que la UI es un
// agujero. Acá salen las dos de la misma llamada.

import { CONFIG } from '../config'
import type { Modulo } from './modulos'

export type ModalidadTorneo =
  | 'grupos'
  | 'liguilla'
  | 'eliminacion_consolacion'
  | 'equipos'

/** El orden en que se muestran en el selector. El tradicional va primero. */
export const MODALIDADES: ReadonlyArray<ModalidadTorneo> = [
  'grupos',
  'liguilla',
  'eliminacion_consolacion',
  'equipos',
]

/** La que se usa cuando no se declara ninguna: lo que el sistema hizo siempre. */
export const MODALIDAD_POR_DEFECTO: ModalidadTorneo = 'grupos'

export const MODALIDAD_LABEL: Record<ModalidadTorneo, string> = {
  grupos: 'Tradicional',
  liguilla: 'Liguilla',
  eliminacion_consolacion: 'Elim. + consolación',
  equipos: 'Por equipos',
}

/** Cómo se explica en pantalla, en una línea, sin jerga. */
export const MODALIDAD_EXPLICACION: Record<ModalidadTorneo, string> = {
  grupos: 'fase de grupos y después la llave',
  liguilla: 'todos contra todos, sin llave',
  eliminacion_consolacion: 'llave directa, y el que pierde va al cuadro de consuelo',
  equipos: 'equipos de 2 o 3, al mejor de 5 partidos',
}

/**
 * Qué módulo enciende cada modalidad.
 *
 * `grupos` no tiene módulo: es el comportamiento base y no se puede apagar.
 * Equipos va aparte de las otras dos porque no es una variante del mismo motor
 * —trae sus propias tablas, participantes que son equipos y partidos de
 * dobles—, así que un club puede querer liguilla sin meterse en eso.
 */
const MODULO_DE: Record<ModalidadTorneo, Modulo | null> = {
  grupos: null,
  liguilla: 'torneos_modalidades',
  eliminacion_consolacion: 'torneos_modalidades',
  equipos: 'torneos_equipos',
}

export function moduloDe(modalidad: ModalidadTorneo): Modulo | null {
  return MODULO_DE[modalidad]
}

/** Normaliza lo que venga de la base o del cliente a una modalidad conocida. */
export function modalidadDe(valor: string | null | undefined): ModalidadTorneo {
  return (MODALIDADES as string[]).includes(valor ?? '')
    ? (valor as ModalidadTorneo)
    : MODALIDAD_POR_DEFECTO
}

/** Normaliza las ruedas a los dos valores que el CHECK de la base acepta. */
export function ruedasDe(valor: number | string | null | undefined): 1 | 2 {
  return Number(valor) === 2 ? 2 : 1
}

/** Solo la liguilla se juega más de una vuelta. */
export function usaRuedas(modalidad: ModalidadTorneo): boolean {
  return modalidad === 'liguilla'
}

/**
 * Si tiene sentido sembrar cabezas de serie.
 *
 * En una liguilla NO, y no por ahorrar trabajo: con todos contra todos la
 * siembra no cambia un solo resultado. Lo más que haría es ordenar el
 * calendario para que el clásico no caiga en la primera fecha, y eso es
 * espectáculo, no deporte.
 *
 * En eliminación directa pesa MÁS que en el torneo tradicional, aunque suene al
 * revés: en el tradicional los grupos ya separan a los favoritos antes de la
 * llave, y acá el cuadro se arma directo desde la inscripción. Sin siembra, los
 * dos mejores pueden cruzarse en primera ronda.
 */
export function usaCabezasSerie(modalidad: ModalidadTorneo): boolean {
  return modalidad !== 'liguilla'
}

/** Mínimo de participantes para que la modalidad tenga sentido. */
export function minParticipantes(modalidad: ModalidadTorneo): number {
  // En `equipos` cuenta equipos, no jugadores: dos es lo mínimo para que haya
  // un encuentro.
  if (modalidad === 'equipos') return 2
  // Una liguilla de 3 ya es un torneo de verdad (tres partidos, tabla real).
  if (modalidad === 'liguilla') return 3
  return CONFIG.TORNEO_MIN_JUGADORES
}

/**
 * Qué selectores de "al mejor de cuántos sets" mostrar, y con qué nombre.
 *
 * Las dos columnas de la migración 262 —`formato_grupos` y `formato_llave`— se
 * reparten distinto según la modalidad. Los nombres de las columnas quedaron
 * atados al torneo tradicional, que era el único que existía cuando se
 * crearon; el rol que cumplen es el que dice el `label`.
 *
 * Sin esto, el selector seguiría preguntando por "Fase de grupos" y "Llave
 * (playoffs)" en una liguilla, que no tiene ninguna de las dos.
 */
export type CampoFormato = 'formato_grupos' | 'formato_llave'

export interface FaseDeSets {
  campo: CampoFormato
  label: string
}

const SETS_POR_MODALIDAD: Record<ModalidadTorneo, ReadonlyArray<FaseDeSets>> = {
  grupos: [
    { campo: 'formato_grupos', label: 'Fase de grupos' },
    { campo: 'formato_llave', label: 'Llave (playoffs)' },
  ],
  liguilla: [
    { campo: 'formato_grupos', label: 'Todos los partidos' },
  ],
  eliminacion_consolacion: [
    { campo: 'formato_llave', label: 'Cuadro principal' },
    { campo: 'formato_grupos', label: 'Cuadro de consolación' },
  ],
  equipos: [
    { campo: 'formato_llave', label: 'Todos los partidos' },
  ],
}

export function fasesDeSets(modalidad: ModalidadTorneo): ReadonlyArray<FaseDeSets> {
  return SETS_POR_MODALIDAD[modalidad]
}

/**
 * Las modalidades que este torneo puede elegir. **La única fuente de verdad.**
 *
 * De acá salen los botones del formulario Y la validación de `crearTorneo`, que
 * es lo que impide que se desalineen.
 *
 * Dos reglas, y las dos protegen a un club en producción:
 *
 * 1. **El torneo interno es siempre tradicional.** Decisión del 2026-09-09. El
 *    torneo interno es la pantalla que Buin más usa —con sus categorías y
 *    géneros—, así que queda literalmente fuera del alcance de las modalidades.
 * 2. **Sin el módulo, no hay modalidad.** Un club que no pidió esto ve el
 *    formulario de siempre.
 *
 * `grupos` está SIEMPRE en la lista: es el comportamiento base y no se apaga.
 */
export function modalidadesDisponibles(params: {
  tipo: 'interno' | 'externo' | null | undefined
  tiene: (modulo: string) => boolean
}): ReadonlyArray<ModalidadTorneo> {
  if (params.tipo !== 'externo') return ['grupos']
  return MODALIDADES.filter(m => {
    const modulo = moduloDe(m)
    return modulo === null || params.tiene(modulo)
  })
}

/**
 * Si este torneo puede usar esta modalidad. Lo llama `crearTorneo` antes de
 * escribir, porque una Server Action recibe lo que le manden: esconder el
 * selector en el formulario no impide nada.
 */
export function puedeUsarModalidad(params: {
  modalidad: ModalidadTorneo
  tipo: 'interno' | 'externo' | null | undefined
  tiene: (modulo: string) => boolean
}): boolean {
  return modalidadesDisponibles(params).includes(params.modalidad)
}
