export type EstadoTarea = 'sin_realizar' | 'parcial' | 'hecho'
export type AsignadoA = 'luis' | 'benjamin'

export const ESTADOS_TAREA: ReadonlyArray<{ key: EstadoTarea; label: string }> = [
  { key: 'sin_realizar', label: 'Sin realizar' },
  { key: 'parcial', label: 'Parcial' },
  { key: 'hecho', label: 'Hecho' },
]

export const PERSONAS: ReadonlyArray<{ key: AsignadoA; label: string }> = [
  { key: 'luis', label: 'Luis' },
  { key: 'benjamin', label: 'Benjamín' },
]

export function esAsignadoValido(valor: string): valor is AsignadoA {
  return PERSONAS.some(p => p.key === valor)
}

/** Cuánto se queda visible una tarea después de marcarla como hecha. */
export const HORAS_VISIBLE_TRAS_HECHA = 12

export function esEstadoTarea(valor: string): valor is EstadoTarea {
  return ESTADOS_TAREA.some(e => e.key === valor)
}

type TareaVisibilidad = {
  estado: string
  completada_en: string | null
}

/**
 * Si la tarea todavía va en la lista.
 *
 * Las pendientes siempre. Las hechas solo durante las 12 horas siguientes,
 * para que quien la marcó alcance a verla tildada y pueda deshacerla si se
 * equivocó de fila.
 *
 * Una tarea marcada como hecha SIN `completada_en` se considera visible: es un
 * estado que el trigger de la base no debería producir nunca, y ante la duda
 * es mejor mostrarla de más que hacerla desaparecer sin explicación.
 */
export function tareaVisible(tarea: TareaVisibilidad, ahora = new Date()): boolean {
  if (tarea.estado !== 'hecho') return true
  if (!tarea.completada_en) return true
  return horasDesde(tarea.completada_en, ahora) < HORAS_VISIBLE_TRAS_HECHA
}

/**
 * Horas que le quedan a una tarea hecha antes de salir de la lista, redondeado
 * hacia arriba para el cartelito ("sale en 3 h"). `null` si no aplica.
 */
export function horasHastaOcultar(tarea: TareaVisibilidad, ahora = new Date()): number | null {
  if (tarea.estado !== 'hecho' || !tarea.completada_en) return null
  const restantes = HORAS_VISIBLE_TRAS_HECHA - horasDesde(tarea.completada_en, ahora)
  return restantes > 0 ? Math.ceil(restantes) : 0
}

function horasDesde(iso: string, ahora: Date): number {
  return (ahora.getTime() - new Date(iso).getTime()) / 3_600_000
}

/**
 * Orden de la lista: primero lo que falta, después lo recién hecho.
 *
 * Dentro de lo pendiente, lo más antiguo arriba —lo que lleva más tiempo sin
 * hacerse es justamente lo que hay que mirar—. Lo hecho va al final, lo más
 * reciente primero, porque es lo que uno acaba de tildar.
 */
export function ordenarTareas<T extends TareaVisibilidad & { creada_en: string }>(tareas: T[]): T[] {
  return [...tareas].sort((a, b) => {
    const aHecha = a.estado === 'hecho'
    const bHecha = b.estado === 'hecho'
    if (aHecha !== bHecha) return aHecha ? 1 : -1
    if (aHecha) return (b.completada_en ?? '').localeCompare(a.completada_en ?? '')
    return a.creada_en.localeCompare(b.creada_en)
  })
}
