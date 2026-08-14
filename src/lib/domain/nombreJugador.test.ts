import { describe, expect, it } from 'vitest'
import { fechaNacimientoInput, nombreDesdePartes } from './nombreJugador'

describe('nombreDesdePartes', () => {
  it('junta nombres y apellidos reales', () => {
    expect(nombreDesdePartes({
      nombres: 'Colomba', apellido1: 'Pérez', apellido2: 'Soto', apellido3: 'no',
    })).toBe('Colomba Pérez Soto')
  })

  it('ignora vacíos y "no"', () => {
    expect(nombreDesdePartes({
      nombres: '  Ana  ', apellido1: 'Muñoz', apellido2: '', apellido3: 'NO',
    })).toBe('Ana Muñoz')
  })
})

describe('fechaNacimientoInput', () => {
  it('deja solo el día para el input date', () => {
    expect(fechaNacimientoInput('2010-05-12T00:00:00.000Z')).toBe('2010-05-12')
    expect(fechaNacimientoInput(null)).toBe('')
  })
})
