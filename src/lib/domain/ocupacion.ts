/**
 * Qué tan lleno está un bloque, y qué significa eso para el club.
 *
 * El formulario de Spinhouse pide este indicador para "decidir cuándo abrir,
 * cerrar o dividir un horario y cómo asignar entrenadores". Un número suelto no
 * soporta esa decisión: 12 de 16 no dice nada hasta que alguien lo compara
 * contra un umbral. Por eso el color y la frase salen de acá y no de la
 * pantalla — son la información, no la decoración.
 *
 * Los cortes son los del plan (§7.2) y son del club, no una convención:
 *
 *   < 50 %   evaluar cerrar o fusionar
 *   50–85 %  sano
 *   86–99 %  se está llenando, preparar el siguiente
 *   ≥ 100 %  lleno, evaluar abrir o dividir
 */

export type NivelOcupacion = 'sin_cupo' | 'vacio' | 'sano' | 'llenando' | 'lleno'

/**
 * El porcentaje de ocupación. **No se recorta en 100**: un bloque con 18
 * inscritos y 16 lugares está al 113 %, y esconderlo detrás de un 100 % borra
 * justo el dato que obliga a actuar.
 *
 * Un cupo de 0 no es "todo lleno", es "todavía no se sabe cuánta gente entra"
 * —un bloque sin mesas declaradas, por ejemplo—. Devuelve `null` para que la
 * pantalla lo diga con palabras en vez de pintar una barra inventada.
 */
export function porcentajeOcupacion(inscritos: number, cupo: number): number | null {
  if (!Number.isFinite(cupo) || cupo <= 0) return null
  return Math.round((Math.max(0, inscritos) / cupo) * 100)
}

export function nivelOcupacion(inscritos: number, cupo: number): NivelOcupacion {
  const pct = porcentajeOcupacion(inscritos, cupo)
  if (pct === null) return 'sin_cupo'
  if (pct >= 100) return 'lleno'
  if (pct >= 86) return 'llenando'
  if (pct >= 50) return 'sano'
  return 'vacio'
}

/** Color y frase de cada nivel. La frase dice qué hacer, no qué pasa. */
export const OCUPACION: Record<NivelOcupacion, { color: string; fondo: string; que: string }> = {
  sin_cupo: { color: '#64748b', fondo: '#f1f5f9', que: 'Sin cupo definido' },
  vacio:    { color: '#64748b', fondo: '#f1f5f9', que: 'Evaluar cerrar o fusionar' },
  sano:     { color: '#16a34a', fondo: '#f0fdf4', que: 'Sano' },
  llenando: { color: '#d97706', fondo: '#fffbeb', que: 'Se está llenando' },
  lleno:    { color: '#dc2626', fondo: '#fef2f2', que: 'Lleno: evaluar abrir o dividir' },
}
