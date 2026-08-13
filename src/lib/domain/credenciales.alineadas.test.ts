import { describe, expect, it } from 'vitest'
import { usuarioLoginDe, authEmailDe, generarEmailInicial } from './credenciales'

// El caso Edison. Ficha sin correo, teléfono guardado como "+56937073626":
//
//   · `authEmailDe` exigía nueve dígitos pelados, así que descartó el teléfono
//     y creó la cuenta con el RUT → 215892905@rut.cmsports.cl
//   · `usuarioLoginDe` aceptaba cualquier teléfono no vacío, así que el informe
//     de credenciales mostró "+56937073626"
//
// Al jugador se le entregó un usuario que no existe. Y encima ese texto tampoco
// se puede escribir en la pantalla de login, que pide nueve dígitos o un RUT
// con guion. Ahora las dos salen de una sola decisión.

const login = (d: Parameters<typeof usuarioLoginDe>[0]) => usuarioLoginDe(d).login

/** Lo que hace la pantalla de login con lo que el jugador escribe. */
function loginReconstruye(texto: string): string {
  if (/^\d{9}$/.test(texto)) return `${texto}@cel.cmsports.cl`
  if (/^\d{7,8}-[\dkK]$/i.test(texto)) return `${texto.replace('-', '').toLowerCase()}@rut.cmsports.cl`
  return texto.toLowerCase()
}

describe('lo que se le muestra al admin es lo que sirve para entrar', () => {
  const casos = [
    { que: 'con email', d: { email: 'emunozh@cmsports.cl', telefono: '+56937073626', rut: '21589290-5' } },
    { que: 'celular de 9 dígitos', d: { email: null, telefono: '937073626', rut: '21589290-5' } },
    { que: 'celular con +56 (el caso Edison)', d: { email: null, telefono: '+56937073626', rut: '21589290-5' } },
    { que: 'celular con 56 pegado', d: { email: null, telefono: '56989859433', rut: '8929031-7' } },
    { que: 'solo RUT', d: { email: null, telefono: null, rut: '21589290-5' } },
    { que: 'RUT sin guion', d: { email: null, telefono: null, rut: '215892905' } },
  ]

  for (const { que, d } of casos) {
    it(`${que}: el login mostrado reconstruye el email de auth`, () => {
      const auth = authEmailDe(d)
      expect(auth).not.toBeNull()
      expect(loginReconstruye(login(d))).toBe(auth)
    })
  }
})

describe('un teléfono que la pantalla de login no acepta no se muestra', () => {
  it('"+56937073626" cae al RUT en las dos funciones', () => {
    const d = { email: null, telefono: '+56937073626', rut: '21589290-5' }
    expect(usuarioLoginDe(d)).toEqual({ login: '21589290-5', tipo: 'rut' })
    expect(authEmailDe(d)).toBe('215892905@rut.cmsports.cl')
  })

  it('un "email" sin arroba no sirve de usuario', () => {
    // Había uno cargado como "carlos" a secas: se mostraba como usuario y no
    // se podía usar para nada.
    const d = { email: 'carlos', telefono: '937073626', rut: '12345678-9' }
    expect(usuarioLoginDe(d).tipo).toBe('celular')
    expect(authEmailDe(d)).toBe('937073626@cel.cmsports.cl')
  })

  it('sin ningún dato utilizable no inventa un usuario', () => {
    const d = { email: null, telefono: 'no tiene', rut: null }
    expect(usuarioLoginDe(d).login).toBe('')
    expect(authEmailDe(d)).toBeNull()
  })
})

describe('el correo que se le arma al que no tiene', () => {
  it('sigue el patrón del club', () => {
    // Es el mismo de las cuentas que ya existen: acalderonv@, rsalazarf@.
    expect(generarEmailInicial('Edison Muñoz Hernández')).toBe('emunozh@cmsports.cl')
  })

  it('la ñ y los acentos no llegan al correo', () => {
    expect(generarEmailInicial('Iván Muñoz Ñuñez')).toBe('imunozn@cmsports.cl')
  })

  it('un solo apellido también funciona', () => {
    expect(generarEmailInicial('Denise Torres')).toBe('dtorres@cmsports.cl')
  })
})

describe('crearAccesoJugador deja las tres puntas alineadas', () => {
  it('guarda el correo generado en la ficha y lo devuelve', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const accion = readFileSync(resolve(process.cwd(), 'src/app/actions/jugadores.ts'), 'utf8')
    const fn = accion.slice(accion.indexOf('export async function crearAccesoJugador'))
    const cuerpo = fn.slice(0, fn.indexOf('\n}\n'))

    // El correo generado va a la ficha: es lo que mantiene alineados auth, el
    // informe de credenciales y la pantalla de login.
    expect(cuerpo).toContain('generarEmailInicial')
    expect(cuerpo).toMatch(/from\('jugadores'\)\.update\(\{ email: emailFicha \}\)/)
    // El informe se arma con el correo nuevo, no con el que tenía antes.
    expect(cuerpo).toContain('usuarioLoginDe({ email: emailFicha')
    // Y la pantalla recibe el usuario, que no puede deducir sola.
    expect(cuerpo).toContain('usuario: login')
  })
})

describe('cambiar correo o clave desde el perfil actualiza el informe', () => {
  it('Configuración no toca Auth directo: pasa por la action que espeja la clave', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const pagina = readFileSync(resolve(process.cwd(), 'src/app/configuracion/page.tsx'), 'utf8')
    expect(pagina).toContain('cambiarPasswordPropia')
    expect(pagina).not.toMatch(/updateUser\(\{\s*password/)
  })

  it('sincronizarEmailAuth alinea el espejo aunque Auth no haya cambiado', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'src/lib/credencialesAuth.ts'), 'utf8')
    expect(src).toContain("from('credencial_visible')")
    expect(src).toContain('usuario_login')
    // Si Auth ya coincidía, igual se escribe el login visible. El `return null`
    // temprano era el hueco: el PDF se quedaba con el correo viejo.
    expect(src).not.toMatch(/if \(!nuevo \|\| nuevo === emailActual\) return null/)
  })
})
