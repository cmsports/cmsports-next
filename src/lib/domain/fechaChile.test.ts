import { describe, expect, it } from 'vitest'
import { fechaChile, horaChile } from './fechaChile'

describe('fecha y hora de Chile', () => {
  it('no adelanta el día durante la noche chilena', () => {
    const instante = new Date('2026-07-16T00:30:00.000Z')
    expect(fechaChile(instante)).toBe('2026-07-15')
    expect(horaChile(instante)).toBe('20:30')
  })
})
