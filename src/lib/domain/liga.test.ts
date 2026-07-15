import { describe, it, expect } from 'vitest'
import {
  generarFixtureDivision,
  esResultadoBo5Valido,
  determinarGanadorBo5,
  calcularRankingDivision,
  validarMovimientoPartido,
  type PartidoFinalizado,
  type PartidoExistente,
} from './liga'

describe('fixture round-robin', () => {
  it('generarFixtureDivision numera el orden correlativo', () => {
    const f = generarFixtureDivision(['a', 'b', 'c'])
    expect(f).toHaveLength(3)
    expect(f.map(p => p.orden)).toEqual([0, 1, 2])
  })
})

describe('resultados Bo5', () => {
  it('acepta solo marcadores válidos de mejor de 5', () => {
    for (const [a, b] of [[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3]]) {
      expect(esResultadoBo5Valido(a, b)).toBe(true)
    }
  })
  it('rechaza marcadores inválidos', () => {
    for (const [a, b] of [[3, 3], [2, 2], [4, 0], [3, 3], [0, 0], [1, 2]]) {
      expect(esResultadoBo5Valido(a, b)).toBe(false)
    }
  })
  it('determina el ganador por quién llegó a 3', () => {
    expect(determinarGanadorBo5(3, 1, 'A', 'B')).toBe('A')
    expect(determinarGanadorBo5(2, 3, 'A', 'B')).toBe('B')
  })
})

describe('calcularRankingDivision', () => {
  const p = (aId: string, bId: string, ganadorId: string, setsA: number, setsB: number): PartidoFinalizado => ({
    jugadorAId: aId, jugadorBId: bId, ganadorId, esWalkover: false, setsA, setsB,
  })

  it('victoria = 3 pts, derrota = 1 pt, y ordena por puntos', () => {
    const filas = calcularRankingDivision(['A', 'B', 'C'], [
      p('A', 'B', 'A', 3, 1),
      p('A', 'C', 'A', 3, 0),
      p('B', 'C', 'B', 3, 2),
    ])
    expect(filas[0].jugadorId).toBe('A')
    expect(filas[0].pts).toBe(6)
    expect(filas[0].sf).toBe(6)
    expect(filas[0].sc).toBe(1)
    expect(filas[0].ds).toBe(5)
    expect(filas.map(f => f.jugadorId)).toEqual(['A', 'B', 'C'])
  })

  it('walkover: el perdedor suma 0 pts y no se cuentan sets', () => {
    const filas = calcularRankingDivision(['A', 'B'], [
      { jugadorAId: 'A', jugadorBId: 'B', ganadorId: 'A', esWalkover: true, setsA: null, setsB: null },
    ])
    const a = filas.find(f => f.jugadorId === 'A')!
    const b = filas.find(f => f.jugadorId === 'B')!
    expect(a.pts).toBe(3)
    expect(b.pts).toBe(0)
    expect(a.sf).toBe(0)
    expect(b.pp).toBe(1)
  })

  it('desempata por diferencia de sets cuando hay igualdad de puntos', () => {
    // Ciclo A>B, B>C, C>A: todos 4 pts y 1 PG, se ordenan por DS
    const filas = calcularRankingDivision(['A', 'B', 'C'], [
      p('A', 'B', 'A', 3, 2),
      p('B', 'C', 'B', 3, 0),
      p('C', 'A', 'C', 3, 0),
    ])
    expect(filas.map(f => f.jugadorId)).toEqual(['B', 'C', 'A'])
  })
})

describe('validarMovimientoPartido', () => {
  const base: PartidoExistente = {
    id: 'p1', fechaId: 'f1', mesaId: 'm1', bloqueHorario: '09:00',
    jugadorAId: 'A', jugadorBId: 'B', arbitroId: null,
  }
  const destino = { fechaId: 'f1', mesaId: 'm1', bloqueHorario: '09:00' }

  it('permite mover a una mesa/bloque libre', () => {
    expect(validarMovimientoPartido(base, destino, [base]).valido).toBe(true)
  })
  it('rechaza si la mesa ya está ocupada en ese bloque', () => {
    const otro: PartidoExistente = { ...base, id: 'p2', jugadorAId: 'C', jugadorBId: 'D' }
    const r = validarMovimientoPartido(base, destino, [base, otro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/mesa/i)
  })
  it('rechaza si un jugador ya juega en ese bloque en otra mesa', () => {
    const otro: PartidoExistente = { ...base, id: 'p2', mesaId: 'm2', jugadorAId: 'A', jugadorBId: 'D' }
    const r = validarMovimientoPartido(base, destino, [otro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/jugador/i)
  })
  it('rechaza si el árbitro es uno de los jugadores', () => {
    const conArbitro = { ...base, arbitroId: 'A' }
    const r = validarMovimientoPartido(conArbitro, destino, [conArbitro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/árbitro/i)
  })
})
