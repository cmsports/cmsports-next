import { describe, expect, it } from 'vitest'
import { formatRut, rutValido } from './rut'

describe('formatRut', () => {
  it('deja el guión antes del dígito verificador', () => {
    expect(formatRut('123456785')).toBe('12345678-5')
    expect(formatRut('12.345.678-5')).toBe('12345678-5')
  })

  it('acepta la K como dígito verificador', () => {
    expect(formatRut('11111111k')).toBe('11111111-K')
  })
})

describe('rutValido', () => {
  it('acepta RUTs con dígito verificador correcto', () => {
    expect(rutValido('12345678-5')).toBe(true)
    expect(rutValido('12.345.678-5')).toBe(true)
    expect(rutValido('9999999-3')).toBe(true)
  })

  it('rechaza el dígito verificador equivocado', () => {
    expect(rutValido('12345678-9')).toBe(false)
    expect(rutValido('12345678-0')).toBe(false)
  })

  it('rechaza largos imposibles', () => {
    expect(rutValido('123-4')).toBe(false)
    expect(rutValido('1234567890-1')).toBe(false)
    expect(rutValido('')).toBe(false)
  })

  it('rechaza la K fuera del dígito verificador', () => {
    expect(rutValido('1234k678-5')).toBe(false)
  })
})
