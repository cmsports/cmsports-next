import { describe, expect, it } from 'vitest'
import { requiereApoderado, validarClaseParalimpica } from './fichaParalimpica'

describe('clasificación paralímpica', () => {
  it('admite clasificación pendiente sin asignar clase ficticia', () => {
    expect(validarClaseParalimpica(null, null)).toBeNull()
    expect(validarClaseParalimpica('sentado', null)).toBeNull()
  })
  it('valida todas las clases oficiales según modalidad', () => {
    for (let clase = 1; clase <= 11; clase++) {
      const modalidad = clase <= 5 ? 'sentado' : clase <= 10 ? 'de_pie' : 'intelectual'
      expect(validarClaseParalimpica(modalidad, clase)).toBeNull()
    }
  })
  it('rechaza clases fuera de modalidad, fracciones y modalidad ausente', () => {
    expect(validarClaseParalimpica('sentado', 6)).toBeTruthy()
    expect(validarClaseParalimpica('de_pie', 5)).toBeTruthy()
    expect(validarClaseParalimpica('intelectual', 10)).toBeTruthy()
    expect(validarClaseParalimpica('sentado', 1.5)).toBeTruthy()
    expect(validarClaseParalimpica(null, 1)).toBeTruthy()
    expect(validarClaseParalimpica('otro', null)).toBeTruthy()
  })
})

describe('firma de datos de salud', () => {
  it('exige apoderado para un menor a la fecha de firma', () => {
    expect(requiereApoderado('2008-10-04', '2026-10-03')).toBe(true)
    expect(requiereApoderado('2008-10-04', '2026-10-04')).toBe(false)
    expect(requiereApoderado('2008-10-04', '2026-10-05')).toBe(false)
  })
  it('exige apoderado cuando la edad no se puede acreditar', () => {
    expect(requiereApoderado(null, '2026-10-03')).toBe(true)
    expect(requiereApoderado('inválida', '2026-10-03')).toBe(true)
  })
})
