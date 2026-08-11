import type { EstadoMarcador } from '@/lib/marcador-oficial'

const PREFIX = 'marcador-oficial:'

export function claveMarcadorLocal(partidoId: string) {
  return `${PREFIX}${partidoId}`
}

export function leerMarcadorLocal(partidoId: string): EstadoMarcador | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(claveMarcadorLocal(partidoId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as EstadoMarcador
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function guardarMarcadorLocal(partidoId: string, estado: EstadoMarcador) {
  if (typeof sessionStorage === 'undefined') return
  if (estado.finalizado) {
    sessionStorage.removeItem(claveMarcadorLocal(partidoId))
    return
  }
  sessionStorage.setItem(claveMarcadorLocal(partidoId), JSON.stringify(estado))
}

export function limpiarMarcadorLocal(partidoId: string) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(claveMarcadorLocal(partidoId))
}

/** Prioriza estado local si el partido sigue abierto y hay puntaje en curso. */
export function mergeEstadoMarcador(
  partidoId: string,
  desdeDb: EstadoMarcador,
  partidoCerrado: boolean,
): EstadoMarcador {
  if (partidoCerrado) {
    limpiarMarcadorLocal(partidoId)
    return desdeDb
  }
  const local = leerMarcadorLocal(partidoId)
  if (!local || local.finalizado) return desdeDb
  const hayPuntajeActivo = local.puntos_a > 0 || local.puntos_b > 0
    || local.historial_sets.length > (desdeDb.historial_sets?.length ?? 0)
  if (hayPuntajeActivo || local.juego_actual > desdeDb.juego_actual) return local
  return desdeDb
}
