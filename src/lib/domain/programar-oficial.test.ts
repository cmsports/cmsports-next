import { describe, expect, it } from 'vitest'
import {
  conflictosAlAsignar,
  detectarConflictosPrograma,
  detectarConflictosProgramaMulti,
  programarPartidosGreedyConInforme,
  type PartidoProgramaMulti,
  type PartidoProgramaSlot,
} from './programar-oficial'

const base: PartidoProgramaSlot[] = [
  { id: 'p1', inscritoA: 'A', inscritoB: 'B', mesa: 1, programadoEn: '2026-06-20T13:00:00.000Z' },
  { id: 'p2', inscritoA: 'C', inscritoB: 'D', mesa: 2, programadoEn: '2026-06-20T13:00:00.000Z' },
]

describe('detectarConflictosPrograma', () => {
  it('sin conflictos en mesas distintas sin jugadores compartidos', () => {
    expect(detectarConflictosPrograma(base)).toHaveLength(0)
  })

  it('detecta mesa duplicada', () => {
    const partidos = [
      ...base,
      { id: 'p3', inscritoA: 'E', inscritoB: 'F', mesa: 1, programadoEn: '2026-06-20T13:00:00.000Z' },
    ]
    const c = detectarConflictosPrograma(partidos)
    expect(c.some(x => x.tipo === 'mesa')).toBe(true)
  })

  it('detecta jugador en dos partidos', () => {
    const partidos = [
      ...base,
      { id: 'p3', inscritoA: 'A', inscritoB: 'E', mesa: 3, programadoEn: '2026-06-20T13:00:00.000Z' },
    ]
    const c = detectarConflictosPrograma(partidos)
    expect(c.some(x => x.tipo === 'jugador')).toBe(true)
  })
})

describe('conflictosAlAsignar', () => {
  it('alerta si se mueve a mesa ocupada', () => {
    const c = conflictosAlAsignar(base, 'p2', 1, new Date('2026-06-20T13:00:00.000Z'))
    expect(c.some(x => x.tipo === 'mesa')).toBe(true)
  })
})

describe('detectarConflictosProgramaMulti', () => {
  it('detecta mismo jugador_id entre eventos distintos', () => {
    const partidos: PartidoProgramaMulti[] = [
      {
        id: 'p1', inscritoA: 'ia1', inscritoB: 'ib1', mesa: 1,
        programadoEn: '2026-06-20T13:00:00.000Z', eventoId: 'e1',
        claveJugadorA: 'jid:X', claveJugadorB: 'jid:Y', labelPartido: 'A vs B (Cat1)',
      },
      {
        id: 'p2', inscritoA: 'ia2', inscritoB: 'ib2', mesa: 2,
        programadoEn: '2026-06-20T13:00:00.000Z', eventoId: 'e2',
        claveJugadorA: 'jid:X', claveJugadorB: 'jid:Z', labelPartido: 'A vs C (Cat2)',
      },
    ]
    const c = detectarConflictosProgramaMulti(partidos)
    expect(c.some(x => x.tipo === 'jugador' && x.motivo.includes('dos eventos'))).toBe(true)
  })
})

describe('programarPartidosGreedyConInforme', () => {
  it('reporta omitidos si maxBloques es insuficiente', () => {
    const partidos = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      inscritoA: `a${i}`,
      inscritoB: `b${i}`,
      prioridad: i,
    }))
    const { asignaciones, omitidos } = programarPartidosGreedyConInforme(partidos, {
      mesas: 1,
      bloqueMinutos: 25,
      inicio: new Date('2026-08-15T09:00:00-03:00'),
      maxBloques: 5,
    })
    expect(asignaciones.size).toBe(5)
    expect(omitidos).toHaveLength(15)
  })
})
