/**
 * Los tipos de clase que dicta un club, y qué implica cada uno.
 *
 * El formulario del club los enumera: clase grupal por nivel y categoría,
 * entrenamiento del grupo competitivo, clases particulares de 1 o 2 alumnos,
 * escuela de adultos, tenis de mesa paralímpico y arriendo libre de mesas.
 *
 * ── Por qué el tipo es UNA columna y no tres banderas ──────────────────────
 *
 * La tentación es agregar `es_particular`, `es_paralimpico`, `es_arriendo` y
 * seguir sumando booleanos. Con eso son representables los ocho estados
 * imposibles —particular y arriendo a la vez— y ninguna pantalla sabe cuál
 * gana. Un tipo cerrado no tiene estados imposibles.
 *
 * ── Lo que el tipo decide, y lo que NO decide ─────────────────────────────
 *
 * Decide **cuántos jugadores entran por mesa**, porque un particular ocupa una
 * mesa con uno o dos alumnos y un grupal con cuatro. Eso ya lo sabía calcular
 * `mesas.ts` con su `ModalidadClase`; lo que faltaba era de dónde salía esa
 * modalidad, que hasta ahora era siempre 'grupal' por defecto.
 *
 * **No** decide el cupo, ni el precio, ni quién puede inscribirse. El cupo lo
 * sigue derivando `cupoDelBloque` de las mesas; el precio vive en los planes.
 * Un tipo que además fijara precios sería el `if` por club otra vez, con otro
 * nombre.
 *
 * ── El default es el de siempre ───────────────────────────────────────────
 *
 * Un bloque sin tipo —o sea, todos los de Buin— se comporta como 'grupal',
 * que es exactamente lo que `mesas.ts` asumía antes de que esto existiera.
 * Por eso la columna es nullable y `modalidadDe` no revienta con `null`.
 */

import type { ModalidadClase } from './mesas'

export type TipoClase =
  | 'grupal'
  | 'competitivo'
  | 'particular'
  | 'adultos'
  | 'paralimpico'
  | 'arriendo'

type Definicion = {
  clave: TipoClase
  label: string
  /** Cuántos entran por mesa: la de particular o la de grupo. */
  modalidad: ModalidadClase
  /** Si ocupa mesas sin ser una clase: no se pasa lista ni se inscriben alumnos. */
  esClase: boolean
}

export const TIPOS_CLASE: readonly Definicion[] = [
  { clave: 'grupal',      label: 'Grupal por nivel',        modalidad: 'grupal',     esClase: true  },
  { clave: 'competitivo', label: 'Grupo competitivo',       modalidad: 'grupal',     esClase: true  },
  // Uno o dos alumnos por mesa. Es el único que cambia la cuenta de las mesas.
  { clave: 'particular',  label: 'Particular (1 o 2)',      modalidad: 'particular', esClase: true  },
  { clave: 'adultos',     label: 'Escuela de adultos',      modalidad: 'grupal',     esClase: true  },
  { clave: 'paralimpico', label: 'Paralímpico',             modalidad: 'grupal',     esClase: true  },
  // Ocupa mesas y compite por la sala igual que una clase, pero no tiene
  // alumnos ni lista. Que esté en esta lista es lo que hace que el tablero de
  // mesas lo cuente como ocupación en su franja.
  { clave: 'arriendo',    label: 'Arriendo libre de mesas', modalidad: 'grupal',     esClase: false },
]

const POR_CLAVE = new Map(TIPOS_CLASE.map(t => [t.clave, t]))

export function esTipoClase(valor: unknown): valor is TipoClase {
  return typeof valor === 'string' && POR_CLAVE.has(valor as TipoClase)
}

/** El nombre para pantalla. Una clave desconocida se muestra tal cual. */
export function etiquetaTipoClase(valor: string | null | undefined): string {
  if (!valor) return 'Grupal por nivel'
  return POR_CLAVE.get(valor as TipoClase)?.label ?? valor
}

/**
 * La modalidad con la que se cuentan las mesas.
 *
 * Sin tipo, 'grupal': es lo que `mesas.ts` asumía antes y lo que hace que un
 * club que no usa tipos de clase siga calculando igual que ayer.
 */
export function modalidadDe(valor: string | null | undefined): ModalidadClase {
  return POR_CLAVE.get(valor as TipoClase)?.modalidad ?? 'grupal'
}

/** Si en ese bloque hay alumnos que inscribir y lista que pasar. */
export function esClaseConAlumnos(valor: string | null | undefined): boolean {
  if (!valor) return true
  return POR_CLAVE.get(valor as TipoClase)?.esClase ?? true
}
