import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

// El jugador al que borran del club queda con un token válido y sin fila en
// `perfiles`. Antes eso lo dejaba rebotando entre /login y /perfil hasta que
// venciera la sesión —una hora—, con la pantalla en blanco. Estos tests fijan
// las tres piezas que cortan el ciclo.

describe('proxy: token vivo sin fila en perfiles', () => {
  const proxy = leer('src/proxy.ts')

  it('desvía a /sin-club en vez de dejarlo rebotar', () => {
    expect(proxy).toContain("url.pathname = '/sin-club'")
    expect(proxy).toMatch(/if \(user && !perfil\)/)
  })

  it('el desvío va ANTES de las rutas públicas', () => {
    // Si fuera después, /login lo sigue rebotando: esa rama redirige a quien
    // tenga sesión, y este usuario la tiene.
    const iDesvio  = proxy.indexOf('if (user && !perfil)')
    const iPublica = proxy.indexOf('if (publicRoutes.some(')
    expect(iDesvio).toBeGreaterThan(-1)
    expect(iDesvio).toBeLessThan(iPublica)
  })

  it('deja pasar /sin-club, o el desvío se muerde la cola', () => {
    expect(proxy).toMatch(/pathname === '\/sin-club'\) return supabaseResponse/)
  })

  it('busca el perfil una sola vez', () => {
    // Eran dos consultas y cada rama sacaba su propia conclusión de no
    // encontrarlo. Una sola deja un solo criterio.
    const consultas = proxy.match(/\.from\('perfiles'\)/g) ?? []
    expect(consultas.length).toBe(1)
  })

  it('ya no se le inventa el rol a quien no tiene perfil', () => {
    // `perfil?.rol ?? 'jugador'` sobre un perfil inexistente era lo que lo
    // metía en el ciclo. Sigue estando, pero ahora es inalcanzable con null.
    const iDesvio = proxy.indexOf('if (user && !perfil)')
    const iRol    = proxy.indexOf("const rol = perfil?.rol ?? 'jugador'")
    expect(iRol).toBeGreaterThan(iDesvio)
  })
})

describe('/sin-club: corta la sesión muerta y ofrece volver', () => {
  const pagina = leer('src/app/sin-club/page.tsx')

  it('cierra la sesión: sin eso el token muerto sigue en el navegador', () => {
    expect(pagina).toContain('signOut')
  })

  it('borra el perfil cacheado', () => {
    // Era lo que hacía que la app siguiera pintando datos de alguien que ya
    // no existe.
    expect(pagina).toContain('cmsports_perfil')
    expect(pagina).toContain('localStorage.removeItem')
  })

  it('lleva a /registro, que es la solicitud de ingreso', () => {
    expect(pagina).toContain("'/registro'")
  })

  it('si todavía tiene perfil no le cierra la sesión', () => {
    // Alguien que escribe la URL a mano no tiene por qué quedar deslogueado.
    const efecto = pagina.slice(pagina.indexOf('async function salir'))
    const iChequeo = efecto.indexOf("router.replace('/')")
    const iSignOut = efecto.indexOf('signOut')
    expect(iChequeo).toBeGreaterThan(-1)
    expect(iChequeo).toBeLessThan(iSignOut)
  })
})

describe('eliminar un jugador le libera el correo', () => {
  const accion = leer('src/app/actions/jugadores.ts')

  it('borra su usuario de Auth, así puede volver a postular con el mismo mail', () => {
    const eliminar = accion.slice(accion.indexOf('export async function eliminarJugador'))
    expect(eliminar.slice(0, 1400)).toContain('auth.admin.deleteUser')
  })
})
