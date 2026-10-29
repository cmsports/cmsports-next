import { describe, it, expect } from 'vitest'
import { rutaInternaSegura } from './rutaSegura'

describe('rutaInternaSegura', () => {
  it('acepta rutas internas, con query y con hash', () => {
    expect(rutaInternaSegura('/votaciones/abc')).toBe('/votaciones/abc')
    expect(rutaInternaSegura('/votaciones?v=1&x=2')).toBe('/votaciones?v=1&x=2')
    expect(rutaInternaSegura('/perfil#top')).toBe('/perfil#top')
  })

  it('rechaza lo vacío y lo que no empieza con /', () => {
    expect(rutaInternaSegura(null)).toBeNull()
    expect(rutaInternaSegura(undefined)).toBeNull()
    expect(rutaInternaSegura('')).toBeNull()
    expect(rutaInternaSegura('votaciones')).toBeNull()
  })

  it('rechaza otro origen, con cualquier disfraz', () => {
    expect(rutaInternaSegura('https://sitio-falso.cl')).toBeNull()
    expect(rutaInternaSegura('//sitio-falso.cl')).toBeNull()
    expect(rutaInternaSegura('/\\sitio-falso.cl')).toBeNull()
    expect(rutaInternaSegura('javascript:alert(1)')).toBeNull()
    expect(rutaInternaSegura('/\t/sitio-falso.cl')).toBeNull()
    expect(rutaInternaSegura('/\n/sitio-falso.cl')).toBeNull()
  })

  it('rechaza volver al login o al registro', () => {
    expect(rutaInternaSegura('/login')).toBeNull()
    expect(rutaInternaSegura('/login?next=/x')).toBeNull()
    expect(rutaInternaSegura('/registro')).toBeNull()
    // Pero una ruta que solo empieza parecido sí vale.
    expect(rutaInternaSegura('/login-ayuda')).toBe('/login-ayuda')
  })
})
