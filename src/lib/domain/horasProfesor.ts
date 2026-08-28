// Horas efectivamente trabajadas por cada profesor: las que marcó, no las que
// le tocaba dictar.
//
// Las que le tocaba las calcula `reportesMes.ts` desde `bloque_profesores`, y
// son otro número: ahí entra el día que faltó y el que cubrió un compañero. Los
// dos sirven y por eso conviven; este es el que el club usa para pagar, así que
// tiene su prueba aparte.

import { minutosDelDia } from './horario'

/** Una marca: el profesor estuvo en ese bloque ese día. */
export type MarcaProfesor = {
  profesor_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
}

export type ResumenHoras = {
  profesorId: string
  clases: number
  minutos: number
}

/** Cuánto dura un bloque, en minutos. */
export function duracionMinutos(horaInicio: string, horaFin: string): number {
  return Math.max(0, minutosDelDia(horaFin) - minutosDelDia(horaInicio))
}

/**
 * Suma por profesor las clases marcadas y sus minutos.
 *
 * Sale ordenado de más horas a menos: la lectura que interesa es quién trabajó
 * más este mes. A igualdad de minutos, por id, para que el orden no baile entre
 * dos llamadas con los mismos datos.
 */
export function resumenHorasProfes(marcas: MarcaProfesor[]): ResumenHoras[] {
  const acum = new Map<string, ResumenHoras>()

  for (const m of marcas) {
    const ya = acum.get(m.profesor_id)
      ?? { profesorId: m.profesor_id, clases: 0, minutos: 0 }
    ya.clases  += 1
    ya.minutos += duracionMinutos(m.hora_inicio, m.hora_fin)
    acum.set(m.profesor_id, ya)
  }

  return [...acum.values()].sort((a, b) =>
    b.minutos - a.minutos || a.profesorId.localeCompare(b.profesorId))
}
