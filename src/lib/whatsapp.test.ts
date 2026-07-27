import { describe, expect, it } from 'vitest'
import { telefonoWhatsApp, linkWhatsApp } from './whatsapp'

// Formatos reales tomados de la planilla del club.
describe('telefonoWhatsApp', () => {
  it('le agrega el código de país a los celulares que no lo traen', () => {
    // Este era el caso roto: sin el 56, WhatsApp decía que no existe.
    expect(telefonoWhatsApp('974073161')).toBe('56974073161')
    expect(telefonoWhatsApp('935203720')).toBe('56935203720')
  })

  it('respeta los que ya vienen con código de país', () => {
    expect(telefonoWhatsApp('56978408170')).toBe('56978408170')
    expect(telefonoWhatsApp('+56948788302')).toBe('56948788302')
  })

  it('ignora espacios, guiones y símbolos mal tipeados', () => {
    expect(telefonoWhatsApp('9 7525 2054')).toBe('56975252054')
    expect(telefonoWhatsApp('9-45301381')).toBe('56945301381')
    expect(telefonoWhatsApp('±56988158583')).toBe('56988158583')
    expect(telefonoWhatsApp('+56 9897 4678 4')).toBe('56989746784')
    expect(telefonoWhatsApp('569 20401524')).toBe('56920401524')
  })

  it('descarta lo que no es un celular chileno', () => {
    expect(telefonoWhatsApp('71012870')).toBeNull()   // fijo, 8 dígitos
    expect(telefonoWhatsApp('12345')).toBeNull()
    expect(telefonoWhatsApp('')).toBeNull()
    expect(telefonoWhatsApp(null)).toBeNull()
    expect(telefonoWhatsApp(undefined)).toBeNull()
    expect(telefonoWhatsApp('sin telefono')).toBeNull()
  })
})

describe('linkWhatsApp', () => {
  it('arma el link con y sin mensaje', () => {
    expect(linkWhatsApp('974073161')).toBe('https://wa.me/56974073161')
    expect(linkWhatsApp('974073161', 'Hola!')).toBe('https://wa.me/56974073161?text=Hola!')
  })

  it('devuelve null cuando el número no sirve, para no mostrar el botón', () => {
    expect(linkWhatsApp('71012870')).toBeNull()
    expect(linkWhatsApp(null, 'Hola')).toBeNull()
  })
})
