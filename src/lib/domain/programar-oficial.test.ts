import { describe, expect, it } from 'vitest'
import {
  conflictosAlAsignar,
  detectarConflictosPrograma,
  detectarConflictosProgramaMulti,
  programarCampeonatoPorDias,
  programarGruposEnOlas,
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
  it('no marca conflicto los partidos del mismo grupo a la misma hora', () => {
    const t = '2026-06-20T12:00:00.000Z'
    const partidos: PartidoProgramaMulti[] = [
      { id: 'g1', inscritoA: 'ia', inscritoB: 'ib', mesa: 3, programadoEn: t, grupoId: 'G', claveJugadorA: 'rios', claveJugadorB: 'arancibia' },
      { id: 'g2', inscritoA: 'ia', inscritoB: 'ic', mesa: 3, programadoEn: t, grupoId: 'G', claveJugadorA: 'rios', claveJugadorB: 'ugas' },
      { id: 'g3', inscritoA: 'ib', inscritoB: 'ic', mesa: 3, programadoEn: t, grupoId: 'G', claveJugadorA: 'arancibia', claveJugadorB: 'ugas' },
    ]
    expect(detectarConflictosProgramaMulti(partidos)).toHaveLength(0)
  })

  it('grupo de 4 en dos mesas a la misma hora tampoco es conflicto', () => {
    const t = '2026-06-20T14:00:00.000Z'
    const partidos: PartidoProgramaMulti[] = [
      { id: 'a1', inscritoA: 'p1', inscritoB: 'p2', mesa: 11, programadoEn: t, grupoId: 'G37', claveJugadorA: 'a', claveJugadorB: 'b' },
      { id: 'a2', inscritoA: 'p3', inscritoB: 'p4', mesa: 12, programadoEn: t, grupoId: 'G37', claveJugadorA: 'c', claveJugadorB: 'd' },
      { id: 'a3', inscritoA: 'p1', inscritoB: 'p3', mesa: 11, programadoEn: t, grupoId: 'G37', claveJugadorA: 'a', claveJugadorB: 'c' },
    ]
    expect(detectarConflictosProgramaMulti(partidos)).toHaveLength(0)
  })

  it('sigue marcando dos grupos distintos en la misma mesa', () => {
    const t = '2026-06-20T12:00:00.000Z'
    const partidos: PartidoProgramaMulti[] = [
      { id: 'g1', inscritoA: 'a', inscritoB: 'b', mesa: 3, programadoEn: t, grupoId: 'G1', claveJugadorA: 'a', claveJugadorB: 'b' },
      { id: 'h1', inscritoA: 'c', inscritoB: 'd', mesa: 3, programadoEn: t, grupoId: 'G2', claveJugadorA: 'c', claveJugadorB: 'd' },
    ]
    expect(detectarConflictosProgramaMulti(partidos).some(x => x.tipo === 'mesa')).toBe(true)
  })

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

describe('programarGruposEnOlas', () => {
  it('un grupo ocupa una mesa y todos sus partidos la misma hora', () => {
    const { asignaciones, omitidosGrupos } = programarGruposEnOlas(
      [
        { grupoId: 'A', partidoIds: ['a1', 'a2', 'a3'] },
        { grupoId: 'B', partidoIds: ['b1', 'b2', 'b3'] },
      ],
      { mesas: 2, bloqueMinutos: 70, inicio: new Date('2026-06-20T09:00:00-04:00') },
    )
    expect(omitidosGrupos).toHaveLength(0)
    expect(asignaciones.get('a1')?.mesa).toBe(1)
    expect(asignaciones.get('a3')?.mesa).toBe(1)
    expect(asignaciones.get('b1')?.mesa).toBe(2)
    expect(asignaciones.get('a1')?.programadoEn.getTime()).toBe(asignaciones.get('a2')?.programadoEn.getTime())
  })

  it('salta un receso y no pone dos grupos con el mismo jugador en la misma ola', () => {
    const inicio = new Date('2026-08-15T09:00:00-03:00')
    const recesoInicio = new Date('2026-08-15T10:10:00-03:00')
    const { asignaciones, fin } = programarGruposEnOlas(
      [
        { grupoId: 'A', partidoIds: ['a1'], clavesJugadores: ['juan'] },
        { grupoId: 'B', partidoIds: ['b1'], clavesJugadores: ['juan'] },
      ],
      {
        mesas: 2,
        bloqueMinutos: 70,
        inicio,
        intervalosBloqueados: [{ inicio: recesoInicio, fin: new Date('2026-08-15T10:50:00-03:00') }],
      },
    )
    expect(asignaciones.get('a1')?.programadoEn.getTime()).toBe(inicio.getTime())
    expect(asignaciones.get('b1')?.programadoEn.getTime()).toBeGreaterThan(inicio.getTime())
    expect(fin.getTime()).toBeGreaterThan(recesoInicio.getTime())
  })
})

describe('programarCampeonatoPorDias', () => {
  it('grupos comparten mesa/hora; llaves empiezan después', () => {
    const { asignaciones, omitidos } = programarCampeonatoPorDias(
      [
        { id: 'g1', fechaJuego: '2026-08-15', fase: 'grupos', orden: 0, grupoId: 'GA', inscritoA: 'a', inscritoB: 'b' },
        { id: 'g2', fechaJuego: '2026-08-15', fase: 'grupos', orden: 1, grupoId: 'GA', inscritoA: 'a', inscritoB: 'c' },
        { id: 'l1', fechaJuego: '2026-08-15', fase: '8vos', orden: 0, grupoId: null, inscritoA: 'a', inscritoB: 'x' },
      ],
      { mesas: 8, bloqueGrupoMinutos: 70, bloqueLlaveMinutos: 25, horaInicio: '09:00' },
    )
    expect(omitidos).toHaveLength(0)
    expect(asignaciones.get('g1')?.mesa).toBe(asignaciones.get('g2')?.mesa)
    expect(asignaciones.get('g1')?.programadoEn.getTime()).toBe(asignaciones.get('g2')?.programadoEn.getTime())
    expect(asignaciones.get('l1')?.programadoEn.getTime()).toBeGreaterThan(asignaciones.get('g1')!.programadoEn.getTime())
  })
})
