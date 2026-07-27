import { describe, expect, it } from 'vitest'
import { montoEsperado } from './mensualidades'

// El modal de "Marcar pagado" estimaba el monto por el plan del jugador e
// ignoraba su mensualidad real: alguien de $25.000 con un plan fuera de
// 8/12/16 sesiones caía al último caso y se le registraban $15.000.
describe('montoEsperado', () => {
  it('usa la cuota ya emitida para ese mes por sobre todo', () => {
    expect(montoEsperado({ mensualidad: 25000, sesiones_limite: 8 }, { monto: 30000 })).toBe(30000)
  })

  it('usa la mensualidad del jugador cuando la cuota aún no tiene monto', () => {
    expect(montoEsperado({ mensualidad: 25000, sesiones_limite: 4 }, null)).toBe(25000)
    expect(montoEsperado({ mensualidad: 25000, sesiones_limite: null }, { monto: null })).toBe(25000)
  })

  it('respeta la mensualidad aunque el plan no sea 4, 8, 12 ni 16', () => {
    // Este era el caso roto: un sesiones_limite fuera de la tabla devolvía 15000.
    expect(montoEsperado({ mensualidad: 25000, sesiones_limite: 20 }, null)).toBe(25000)
    expect(montoEsperado({ mensualidad: 25000, sesiones_limite: 99 }, null)).toBe(25000)
  })

  it('recién estima por el plan si el jugador no tiene mensualidad cargada', () => {
    expect(montoEsperado({ sesiones_limite: 4 }, null)).toBe(15000)
    expect(montoEsperado({ sesiones_limite: 8 }, null)).toBe(25000)
    expect(montoEsperado({ sesiones_limite: 12 }, null)).toBe(30000)
    expect(montoEsperado({ sesiones_limite: 16 }, null)).toBe(40000)
  })

  it('cae al monto por defecto solo cuando no hay ningún dato', () => {
    expect(montoEsperado({}, null)).toBe(25000)
    expect(montoEsperado({ sesiones_limite: 7 }, null)).toBe(25000)
    expect(montoEsperado(null, null)).toBe(25000)
  })
})
