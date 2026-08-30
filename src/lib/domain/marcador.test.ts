import { describe, it, expect } from 'vitest'
import { esSetValido, resumirBo5, esResultadoBo5Valido, determinarGanadorBo5 } from './marcador'

describe('esSetValido', () => {
  it('acepta un set normal ganado a 11', () => {
    expect(esSetValido(11, 9)).toBe(true)
    expect(esSetValido(11, 0)).toBe(true)
    expect(esSetValido(4, 11)).toBe(true)
  })

  it('rechaza un set cerrado antes de 11', () => {
    expect(esSetValido(10, 8)).toBe(false)
    expect(esSetValido(9, 2)).toBe(false)
  })

  it('desde 10 iguales exige dos de ventaja', () => {
    expect(esSetValido(11, 10)).toBe(false)
    expect(esSetValido(12, 10)).toBe(true)
    expect(esSetValido(13, 11)).toBe(true)
    expect(esSetValido(13, 10)).toBe(false)
    expect(esSetValido(20, 18)).toBe(true)
  })

  it('rechaza empates, negativos y decimales', () => {
    expect(esSetValido(11, 11)).toBe(false)
    expect(esSetValido(11, -1)).toBe(false)
    expect(esSetValido(11.5, 9)).toBe(false)
  })
})

describe('resumirBo5', () => {
  it('suma sets y puntos de un 3-0', () => {
    expect(resumirBo5([[11, 9], [11, 7], [11, 5]])).toEqual({ setsA: 3, setsB: 0, puntosA: 33, puntosB: 21 })
  })

  it('suma sets y puntos de un 3-2 con deuce', () => {
    expect(resumirBo5([[11, 9], [9, 11], [12, 10], [8, 11], [11, 6]]))
      .toEqual({ setsA: 3, setsB: 2, puntosA: 51, puntosB: 47 })
  })

  it('rechaza un partido sin terminar', () => {
    expect(resumirBo5([[11, 9], [11, 7]])).toBeNull()
    expect(resumirBo5([[11, 9], [9, 11], [11, 7], [8, 11]])).toBeNull()
  })

  it('rechaza un set jugado después de que el partido terminó', () => {
    expect(resumirBo5([[11, 9], [11, 7], [11, 5], [11, 4]])).toBeNull()
  })

  it('rechaza un set inválido aunque el partido cierre', () => {
    expect(resumirBo5([[11, 9], [11, 7], [10, 8]])).toBeNull()
  })

  it('rechaza más de 5 sets', () => {
    expect(resumirBo5([[11, 9], [9, 11], [11, 9], [9, 11], [11, 9], [11, 9]])).toBeNull()
  })

  it('coincide con la validación de sets que ya usaba Liga', () => {
    const r = resumirBo5([[11, 9], [9, 11], [11, 7], [11, 6]])!
    expect(esResultadoBo5Valido(r.setsA, r.setsB)).toBe(true)
    expect(determinarGanadorBo5(r.setsA, r.setsB, 'ana', 'beto')).toBe('ana')
  })
})
