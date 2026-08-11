import { describe, expect, it } from 'vitest'
import { prioridadPartidoOficial, programarPartidosGreedy } from './programar-oficial'

describe('programarPartidosGreedy', () => {
  it('asigna mesas distintas en el mismo bloque', () => {
    const inicio = new Date('2026-08-11T09:00:00-04:00')
    const map = programarPartidosGreedy(
      [
        { id: '1', inscritoA: 'a', inscritoB: 'b', prioridad: 0 },
        { id: '2', inscritoA: 'c', inscritoB: 'd', prioridad: 1 },
      ],
      { mesas: 2, bloqueMinutos: 25, inicio },
    )
    expect(map.size).toBe(2)
    const s1 = map.get('1')!
    const s2 = map.get('2')!
    expect(s1.mesa).not.toBe(s2.mesa)
    expect(s1.programadoEn.getTime()).toBe(s2.programadoEn.getTime())
  })

  it('no programa dos partidos del mismo jugador a la misma hora', () => {
    const inicio = new Date('2026-08-11T09:00:00-04:00')
    const map = programarPartidosGreedy(
      [
        { id: '1', inscritoA: 'a', inscritoB: 'b', prioridad: 0 },
        { id: '2', inscritoA: 'a', inscritoB: 'c', prioridad: 1 },
      ],
      { mesas: 4, bloqueMinutos: 25, inicio },
    )
    const s1 = map.get('1')!
    const s2 = map.get('2')!
    expect(s2.programadoEn.getTime()).toBeGreaterThan(s1.programadoEn.getTime())
  })
})

describe('prioridadPartidoOficial', () => {
  it('grupos van antes que cuartos', () => {
    expect(prioridadPartidoOficial('grupos', 0)).toBeLessThan(prioridadPartidoOficial('cuartos', 0))
  })
})
