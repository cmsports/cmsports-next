import { describe, it, expect } from 'vitest'
import { tocaRespaldar, domingoDeLaSemana, diasDesde } from './respaldoAviso'

describe('aviso de respaldo', () => {
  it('el domingo de la semana', () => {
    expect(domingoDeLaSemana('2026-08-07')).toBe('2026-08-02') // viernes -> domingo anterior
    expect(domingoDeLaSemana('2026-08-02')).toBe('2026-08-02') // domingo -> él mismo
  })

  it('avisa si nunca se respaldó', () => {
    expect(tocaRespaldar(null, '2026-08-07')).toBe(true)
  })

  it('avisa el domingo aunque se haya respaldado el sábado', () => {
    expect(tocaRespaldar('2026-08-01', '2026-08-02')).toBe(true)
  })

  it('no avisa si ya se respaldó esta semana', () => {
    expect(tocaRespaldar('2026-08-03', '2026-08-07')).toBe(false)
    expect(tocaRespaldar('2026-08-07', '2026-08-07')).toBe(false)
  })

  it('cuenta los días desde el último respaldo', () => {
    expect(diasDesde('2026-08-01', '2026-08-07')).toBe(6)
    expect(diasDesde('2026-08-07', '2026-08-07')).toBe(0)
  })
})
