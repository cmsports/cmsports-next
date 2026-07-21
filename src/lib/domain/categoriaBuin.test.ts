import { describe, expect, it } from 'vitest'
import { categoriaBuinPorFechaNacimiento } from './categoriaBuin'

describe('categoriaBuinPorFechaNacimiento', () => {
  it('asigna categorías infantiles y juveniles por año', () => {
    expect(categoriaBuinPorFechaNacimiento('2016-01-01')).toBe('PENECA')
    expect(categoriaBuinPorFechaNacimiento('2013-06-01')).toBe('PREINFANTIL')
    expect(categoriaBuinPorFechaNacimiento('2011-06-01')).toBe('INFANTIL')
    expect(categoriaBuinPorFechaNacimiento('2009-06-01')).toBe('JUVENIL')
  })

  it('asigna categorías master por año', () => {
    expect(categoriaBuinPorFechaNacimiento('1994-01-01')).toBe('MASTER A')
    expect(categoriaBuinPorFechaNacimiento('1982-01-01')).toBe('MASTER C')
    expect(categoriaBuinPorFechaNacimiento('1948-01-01')).toBe('MASTER J')
  })

  it('cae en TC fuera de los rangos definidos (adultos jóvenes y muy mayores)', () => {
    expect(categoriaBuinPorFechaNacimiento('2000-01-01')).toBe('TC')
    expect(categoriaBuinPorFechaNacimiento('1940-01-01')).toBe('TC')
  })

  it('retorna null sin fecha', () => {
    expect(categoriaBuinPorFechaNacimiento(null)).toBeNull()
  })
})
