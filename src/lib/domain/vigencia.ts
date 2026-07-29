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

/**
 * Con qué fecha se cierra algo que deja de valer AHORA.
 *
 * `vigente_hasta` es el último día en que vale, así que cerrar con la fecha de
 * hoy no saca a nadie: lo deja vivo hasta la medianoche. Al jugador que el profe
 * saca del grupo a las diez de la mañana le seguía apareciendo la lista de ese
 * mismo día, y al que cambiaban de bloque le aparecían los dos a la vez —el
 * viejo cerrado hoy y el nuevo abierto hoy se pisan un día—. Mientras tanto los
 * cupos y la ficha, que preguntan por `vigente_hasta is null`, ya lo daban por
 * fuera: la misma persona sí y no en dos pantallas.
 *
 * El último día que valió es el anterior. Se calcula sobre la fecha en texto y
 * no restando 24 horas a un instante, que en los cambios de hora se corre.
 */
export function cierreVigencia(hoy: string): string {
  return new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
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
