import { describe, expect, it } from 'vitest'
import { moduloRequeridoPorRuta, puedeAccederModulo } from './modulos-rutas'

describe('protección de rutas por módulos del club', () => {
  it.each([
    ['/torneos', 'torneos'],
    ['/torneos/abc', 'torneos'],
    ['/liga/division/abc', 'liga'],
    ['/mis-clases', 'clases'],
    ['/calendario', 'calendario'],
    ['/asistencia/club-id', 'asistencia'],
    ['/estado-cuenta', 'mensualidades'],
    ['/reportes', 'finanzas'],
    ['/redes-sociales', 'redes'],
    ['/tienda', 'tienda'],
  ])('asigna %s al módulo %s', (ruta, modulo) => {
    expect(moduloRequeridoPorRuta(ruta)).toBe(modulo)
  })

  it('mantiene accesibles las rutas centrales', () => {
    expect(puedeAccederModulo('/dashboard', [])).toBe(true)
    expect(puedeAccederModulo('/jugadores', [])).toBe(true)
    expect(puedeAccederModulo('/configuracion', [])).toBe(true)
  })

  it('rechaza una URL directa cuando el módulo no fue asignado', () => {
    expect(puedeAccederModulo('/torneos', ['clases'])).toBe(false)
    expect(puedeAccederModulo('/finanzas', ['torneos'])).toBe(false)
  })

  it('permite la URL directa cuando el módulo fue asignado', () => {
    expect(puedeAccederModulo('/torneos/nuevo', ['torneos'])).toBe(true)
  })
})
