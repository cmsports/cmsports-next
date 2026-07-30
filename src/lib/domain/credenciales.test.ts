import { describe, expect, it } from 'vitest'
import { generarEmailInicial, generarPasswordInicial, usuarioLoginDe } from './credenciales'

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

describe('generarEmailInicial', () => {
  it('1ra letra nombre + primer apellido + 1ra letra segundo apellido', () => {
    expect(generarEmailInicial('Alberto Andres Vergara Sanchez')).toBe('avergaras@cmsports.cl')
    expect(generarEmailInicial('Jorge Munoz Salazar')).toBe('jmunozs@cmsports.cl')
    expect(generarEmailInicial('Colomba Gonzalez Gonzalez')).toBe('cgonzalezg@cmsports.cl')
  })

  // La convención chilena pone los apellidos al final. Con tres tokens damos
  // por hecho que son nombre + apellido + apellido; con cuatro, nombre + nombre
  // + apellido + apellido. No hay forma de adivinarlo sin datos extra.
  it('cuatro tokens: los dos últimos son los apellidos', () => {
    expect(generarEmailInicial('Isidora Teresa Gomez Retamal')).toBe('igomezr@cmsports.cl')
  })

  it('un apellido solo: sin segunda inicial', () => {
    expect(generarEmailInicial('Alberto Honores')).toBe('ahonores@cmsports.cl')
  })

  it('un nombre solo: va tal cual', () => {
    expect(generarEmailInicial('Agustin')).toBe('agustin@cmsports.cl')
  })

  it('aplana acentos y la ñ para que el email sea tipeable', () => {
    expect(generarEmailInicial('José Pérez López')).toBe('jperezl@cmsports.cl')
    expect(generarEmailInicial('Muñoz Núñez')).toBe('mnunez@cmsports.cl')
  })

  it('caracteres raros (guiones, puntos) no ensucian el email', () => {
    expect(generarEmailInicial('J. Pérez-Salgado Rojas')).toBe('jperezsalgador@cmsports.cl')
  })

  it('vacío cae en un valor por defecto en vez de reventar', () => {
    expect(generarEmailInicial('')).toBe('usuario@cmsports.cl')
    expect(generarEmailInicial('   ')).toBe('usuario@cmsports.cl')
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
