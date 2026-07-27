// Todo lo que tiene historia en el sistema —inscripciones a un grupo, bloques
// del horario, profesores asignados— se cierra con una fecha en vez de
// borrarse. Esto es lo que permite preguntar "quién estaba en marzo" y no solo
// "quién está hoy".
//
// La convención es la misma en todas las tablas:
//   vigente_desde  fecha en que empieza a valer (inclusive)
//   vigente_hasta  último día en que vale, o null si sigue abierto

export type Vigencia = {
  vigente_desde: string
  vigente_hasta: string | null
}

/** Si el registro estaba vigente ese día. Ambos extremos cuentan. */
export function vigenteEn(v: Vigencia, fecha: string): boolean {
  return v.vigente_desde <= fecha && (v.vigente_hasta === null || v.vigente_hasta >= fecha)
}

/** Los que estaban vigentes ese día. */
export function vigentesEn<T extends Vigencia>(items: T[], fecha: string): T[] {
  return items.filter(i => vigenteEn(i, fecha))
}

/**
 * Cuántos de esos días el registro estuvo vigente.
 *
 * Se cuenta recorriendo las fechas, nunca multiplicando semanas por días: un
 * mes con cinco lunes tiene cinco sesiones y el siguiente cuatro, y quien entró
 * al grupo a mitad de mes solo debe las que le tocaban desde que entró.
 */
export function diasVigentes(v: Vigencia, fechas: string[]): number {
  return fechas.reduce((n, f) => n + (vigenteEn(v, f) ? 1 : 0), 0)
}
