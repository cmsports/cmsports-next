import { describe, it, expect } from 'vitest'
import { nivelOcupacion, porcentajeOcupacion } from './ocupacion'

describe('porcentajeOcupacion', () => {
  it('un cupo de 0 no es lleno, es que no se sabe', () => {
    expect(porcentajeOcupacion(0, 0)).toBeNull()
    expect(porcentajeOcupacion(5, 0)).toBeNull()
  })

  it('no recorta en 100: pasarse del cupo tiene que verse', () => {
    expect(porcentajeOcupacion(18, 16)).toBe(113)
  })
})

describe('nivelOcupacion', () => {
  // Los bordes son los que se escriben mal: 50 ya es sano y 86 ya está
  // llenándose, no al revés.
  it.each([
    [7,  16, 'vacio'],     // 44 %
    [8,  16, 'sano'],      // 50 % exacto
    [13, 16, 'sano'],      // 81 %
    [14, 16, 'llenando'],  // 88 %
    [16, 16, 'lleno'],     // 100 % exacto
    [18, 16, 'lleno'],     // por encima
    [0,  0,  'sin_cupo'],
  ])('%i de %i → %s', (inscritos, cupo, esperado) => {
    expect(nivelOcupacion(inscritos, cupo)).toBe(esperado)
  })
})
