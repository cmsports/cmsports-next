import { describe, expect, it } from 'vitest'
import { generarPasswordInicial, usuarioLoginDe } from './credenciales'

// Casos verificados contra el reporte impreso que el admin ya usaba a mano,
// para que la clave que ve en el sistema coincida con la que ya repartió.
describe('generarPasswordInicial', () => {
  it('primer nombre + último apellido', () => {
    expect(generarPasswordInicial('Alberto Andres Vergara Sanchez')).toBe('albertosanchez123')
    expect(generarPasswordInicial('Jorge Munoz Salazar')).toBe('jorgesalazar123')
    expect(generarPasswordInicial('Isidora Teresa Gomez Retamal')).toBe('isidoraretamal123')
  })

  it('un solo nombre alcanza para armarla', () => {
    expect(generarPasswordInicial('Agustin')).toBe('agustin123')
  })

  it('los acentos y la ñ se aplanan para que se puedan tipear', () => {
    expect(generarPasswordInicial('José Muñoz')).toBe('josemunoz123')
    expect(generarPasswordInicial('Andrés Núñez')).toBe('andresnunez123')
  })

  it('un nombre vacío no rompe: cae en un valor por defecto', () => {
    expect(generarPasswordInicial('')).toBe('usuario123')
    expect(generarPasswordInicial('   ')).toBe('usuario123')
  })

  it('caracteres raros como puntos o guiones no ensucian la clave', () => {
    expect(generarPasswordInicial('J. Pérez-Salgado')).toBe('jperezsalgado123')
  })
})

describe('usuarioLoginDe', () => {
  it('email manda cuando existe', () => {
    expect(usuarioLoginDe({ email: 'ana@x.cl', telefono: '9999', rut: '1-9' }))
      .toEqual({ login: 'ana@x.cl', tipo: 'email' })
  })

  it('sin email, el celular es el usuario', () => {
    expect(usuarioLoginDe({ telefono: '978408170' }))
      .toEqual({ login: '978408170', tipo: 'celular' })
  })

  // El caso familiar: un celular ya lo tiene otro jugador de la casa.
  it('sin email ni celular propio, se cae al RUT', () => {
    expect(usuarioLoginDe({ rut: '25334201-3' }))
      .toEqual({ login: '25334201-3', tipo: 'rut' })
  })
})
