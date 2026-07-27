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

  // Varios contactos de emergencia traen dos números en la misma celda.
  it('se queda con el primero cuando el campo trae dos números', () => {
    expect(telefonoWhatsApp('937222133 - 959493845')).toBe('56937222133')
    expect(telefonoWhatsApp('+56962218144 / +56962218145')).toBe('56962218144')
    expect(telefonoWhatsApp('+56997831109 - +56997831101 (papá)')).toBe('56997831109')
    expect(telefonoWhatsApp('964380510- 96367521')).toBe('56964380510')
    expect(telefonoWhatsApp('958209737 (papá) o 984005738(mamá)')).toBe('56958209737')
  })

  it('rescata el número aunque venga con el nombre pegado', () => {
    expect(telefonoWhatsApp('930224312 Alexandra Calderón (hermana)')).toBe('56930224312')
    expect(telefonoWhatsApp('974005738(mamá) Karen Altamirano')).toBe('56974005738')
  })

  it('descarta lo que no es un celular chileno', () => {
    expect(telefonoWhatsApp('71012870')).toBeNull()   // fijo, 8 dígitos
    expect(telefonoWhatsApp('12345')).toBeNull()
    expect(telefonoWhatsApp('')).toBeNull()
    expect(telefonoWhatsApp(null)).toBeNull()
    expect(telefonoWhatsApp(undefined)).toBeNull()
    expect(telefonoWhatsApp('sin telefono')).toBeNull()
    expect(telefonoWhatsApp('Ingrid Reale')).toBeNull()
    expect(telefonoWhatsApp('-')).toBeNull()
  })

  // Un fijo con muchos dígitos no se puede convertir en móvil recortándolo.
  it('no inventa un móvil a partir de un número que no empieza en 9', () => {
    expect(telefonoWhatsApp('223456789012')).toBeNull()
    expect(telefonoWhatsApp('56223456789')).toBeNull()
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
