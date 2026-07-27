import { describe, expect, it } from 'vitest'
import { montoEsperado } from './mensualidades'

describe('montoEsperado', () => {
  it('manda el monto ya emitido para ese mes', () => {
    expect(montoEsperado({ mensualidad: 30000 }, { monto: 7500 })).toBe(7500)
  })

  it('si la cuota no tiene monto, usa la del jugador', () => {
    expect(montoEsperado({ mensualidad: 26250 }, { monto: null })).toBe(26250)
    expect(montoEsperado({ mensualidad: 26250 }, null)).toBe(26250)
  })

  // Lo que motivó sacar la estimación por plan: el profe cobra montos que no
  // salen de ninguna tabla —$7.000, $21.000, $50.000— y un valor inventado se
  // ve igual de real que uno correcto, así que nadie lo revisa.
  it('sin cuota asignada no inventa un monto', () => {
    expect(montoEsperado({ mensualidad: null }, null)).toBeNull()
    expect(montoEsperado(null, null)).toBeNull()
    expect(montoEsperado(undefined, undefined)).toBeNull()
  })

  it('un cero no cuenta como monto asignado', () => {
    expect(montoEsperado({ mensualidad: 0 }, { monto: 0 })).toBeNull()
  })
})
