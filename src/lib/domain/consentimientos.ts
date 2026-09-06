/**
 * El registro de consentimientos: qué autorizó cada alumno, cuándo, y desde
 * cuándo dejó de autorizarlo.
 *
 * ── Por qué es un registro y no una casilla ────────────────────────────────
 *
 * La tentación es `jugadores.autoriza_uso_imagen boolean`. Una columna, un
 * checkbox, listo. Y funciona para la pregunta fácil —"¿puedo publicar esta
 * foto hoy?"— pero pierde la que de verdad importa:
 *
 *     "Esta foto se publicó en marzo. ¿Había autorización EN MARZO?"
 *
 * Con una casilla, revocar pisa el valor anterior y esa pregunta deja de tener
 * respuesta. Queda un `false` que no distingue entre "nunca autorizó" y
 * "autorizó, publicamos con permiso, y después se arrepintió" — que son la
 * diferencia entre haber cumplido y no. Y no hay red debajo: `jugadores` no
 * tiene trigger de auditoría, así que el valor viejo no queda en ningún lado.
 *
 * Por eso la tabla es **de solo agregar**. Autorizar inserta una fila; revocar
 * inserta otra. El estado de hoy es la fila más reciente, y el estado de
 * cualquier día pasado se puede reconstruir — que es exactamente lo que hay que
 * poder mostrar si alguien reclama.
 *
 * ── El desempate por hora no es un detalle ─────────────────────────────────
 *
 * Autorizar y revocar el mismo día pasa: el apoderado firma en la mañana, se
 * arrepiente en la tarde. Con solo la fecha, cuál gana depende del orden en que
 * la base devuelva las filas, o sea del azar. Por eso `creadoEn` desempata, y
 * por eso la tabla lo guarda.
 */

export type TipoConsentimiento = 'uso_imagen'

export type Consentimiento = {
  tipo: string
  /** `true` = lo autoriza. `false` = lo revoca. */
  otorgado: boolean
  /** `YYYY-MM-DD`: el día en que la persona lo firmó, que puede no ser hoy. */
  fecha: string
  /** Timestamp ISO de cuándo se cargó. Solo desempata dos firmas del mismo día. */
  creadoEn?: string | null
}

export type EstadoConsentimiento = 'autorizado' | 'revocado' | 'sin_registro'

/**
 * La firma que manda a una fecha dada: la más reciente que no sea posterior.
 *
 * `null` si en ese momento no había ninguna, que **no** es lo mismo que un `no`.
 * Un alumno sin registro no autorizó ni negó: nadie le preguntó todavía.
 */
// Genérica para devolver la fila TAL CUAL entró, con las columnas que la
// pantalla necesita mostrar —quién firmó, dónde quedó el respaldo— y no
// recortada al mínimo que esta función mira.
export function firmaVigenteEn<T extends Consentimiento>(
  filas: readonly T[],
  tipo: string,
  fechaISO: string,
): T | null {
  let mejor: T | null = null
  for (const f of filas) {
    if (f.tipo !== tipo) continue
    if (f.fecha > fechaISO) continue
    if (mejor === null) { mejor = f; continue }
    if (f.fecha > mejor.fecha) { mejor = f; continue }
    // Mismo día: gana la que se cargó después. Sin `creadoEn` en alguna de las
    // dos no hay con qué decidir, y se deja la que ya estaba — cambiar de
    // opinión por el orden en que llegaron las filas sería peor.
    if (f.fecha === mejor.fecha && f.creadoEn && mejor.creadoEn && f.creadoEn > mejor.creadoEn) {
      mejor = f
    }
  }
  return mejor
}

/** El estado a una fecha dada. Ver `firmaVigenteEn` para el porqué de los tres. */
export function estadoEn(
  filas: readonly Consentimiento[],
  tipo: string,
  fechaISO: string,
): EstadoConsentimiento {
  const f = firmaVigenteEn(filas, tipo, fechaISO)
  if (f === null) return 'sin_registro'
  return f.otorgado ? 'autorizado' : 'revocado'
}

export const ETIQUETA_TIPO: Record<string, string> = {
  uso_imagen: 'Uso de imagen',
}

export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo
}
