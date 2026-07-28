import { describe, expect, it } from 'vitest'
import { montoEsperado, montoIngresado } from './mensualidades'

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

describe('montoIngresado', () => {
  it('devuelve lo que escribieron', () => {
    expect(montoIngresado('21000')).toBe(21000)
    expect(montoIngresado('0')).toBe(0)
  })

  // El bug que se arrastraba: el formulario de jugador nuevo hacía
  // `parseInt(form.mensualidad) || 25000`, así que crear un jugador sin
  // escribir el monto le dejaba $25.000 puestos.
  it('campo vacío es sin cuota, no un monto de relleno', () => {
    expect(montoIngresado('')).toBeNull()
    expect(montoIngresado('   ')).toBeNull()
    expect(montoIngresado('abc')).toBeNull()
  })

  // El punto es separador de miles: así se escribe la plata acá. Con parseInt,
  // escribir "12.500" guardaba doce pesos y nadie se enteraba.
  it('el separador de miles no recorta el monto', () => {
    expect(montoIngresado('12.500')).toBe(12500)
    expect(montoIngresado('12,500')).toBe(12500)
    expect(montoIngresado('$ 12.500')).toBe(12500)
    expect(montoIngresado('1.250.000')).toBe(1250000)
  })
})
