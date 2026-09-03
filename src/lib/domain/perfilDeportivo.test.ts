import { describe, it, expect } from 'vitest'
import { categoriaPorEdad, edadEn, manoLabel, nivelLabel } from './perfilDeportivo'

describe('edadEn', () => {
  it('no suma el año antes del cumpleaños', () => {
    // El bug clásico: dividir los milisegundos por 365.25 lo daría en 15.
    expect(edadEn('2011-09-03', '2026-09-02')).toBe(14)
    expect(edadEn('2011-09-02', '2026-09-02')).toBe(15) // el día exacto sí cuenta
  })

  it('una fecha ilegible no inventa una edad', () => {
    expect(edadEn('', '2026-09-02')).toBeNull()
    expect(edadEn('ayer', '2026-09-02')).toBeNull()
  })
})

describe('categoriaPorEdad', () => {
  it('sin fecha de nacimiento no adivina', () => {
    expect(categoriaPorEdad(null, '2026-09-02')).toBeNull()
    expect(categoriaPorEdad('', '2026-09-02')).toBeNull()
  })

  it.each([
    ['2016-01-01', 'U11'],     // 10
    ['2015-01-01', 'U13'],     // 11
    ['2013-01-01', 'U15'],     // 13
    ['2011-01-01', 'U17'],     // 15
    ['2009-01-01', 'U19'],     // 17
    ['2007-01-01', 'Adulto'],  // 19
    ['1986-01-01', 'Senior'],  // 40
    ['1987-01-01', 'Adulto'],  // 39: el borde de Senior
  ])('nacido el %s → %s', (nacimiento, esperada) => {
    expect(categoriaPorEdad(nacimiento, '2026-09-02')).toBe(esperada)
  })
})

describe('etiquetas', () => {
  it('un valor desconocido o vacío no rompe la pantalla', () => {
    expect(nivelLabel(null)).toBe('—')
    expect(nivelLabel('crack')).toBe('—')
    expect(nivelLabel('competitivo')).toBe('Competitivo')
    expect(manoLabel(undefined)).toBe('—')
    expect(manoLabel('zurdo')).toBe('Zurdo')
  })
})
