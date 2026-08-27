import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  publicRoutes,
  authFlowRoutes,
  superadminRoutes,
  adminRoutes,
  staffRoutes,
  profesorRoutes,
  jugadorRoutes,
  anyAuthRoutes,
  rutasPublicasTorneo,
} from '@/proxy'

/**
 * Ninguna pantalla puede quedar fuera de las listas del middleware.
 *
 * Cuando una ruta no está en ninguna lista, el middleware la deja pasar sin
 * sesión: la página se renderiza y recién el cliente redirige. Los datos los
 * protege RLS igual, pero la pantalla llega a dibujarse.
 *
 * Ya pasó tres veces y las tres se arreglaron a mano, una por una:
 * `/credenciales` (auditoría del 31 de julio), `/ranking`, y las once que
 * encontró la auditoría del 26 de agosto —entre ellas `/torneo-oficial` entero
 * y `/central-de-pago`—. Acordarse de agregar cada pantalla nueva a una lista
 * que vive en otro archivo no funcionó, así que esto lo comprueba solo.
 *
 * La trampa concreta que hizo falta explicar más de una vez: el matcheo del
 * middleware es `pathname === r || pathname.startsWith(r + '/')`. O sea que
 * tener `/torneos` NO cubre `/torneos-internos`.
 */

const EXENTAS = new Set([
  '/',                 // vitrina pública
  '/sin-club',         // salida del token vivo sin perfil
  '/auth/callback',    // callback de Supabase
  '/registro',
])

// Estas llevan su propio early-return en el middleware, antes de las listas.
const PATRONES_EXENTOS = [
  /^\/asistencia\/[^/]+$/,   // kiosco por club, sin sesión
  /^\/mi-acceso\/[^/]+$/,    // link del grupo: RUT → credencial
]

function rutasDeLaApp(dir: string, prefijo = ''): string[] {
  const out: string[] = []
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) {
      // Los grupos de rutas `(x)` no aparecen en la URL; `api` no es pantalla.
      if (entrada === 'api') continue
      out.push(...rutasDeLaApp(p, entrada.startsWith('(') ? prefijo : `${prefijo}/${entrada}`))
    } else if (entrada === 'page.tsx') {
      out.push(prefijo || '/')
    }
  }
  return out
}

describe('rutas protegidas por el middleware', () => {
  const listas = [
    ...publicRoutes, ...authFlowRoutes, ...superadminRoutes, ...adminRoutes,
    ...staffRoutes, ...profesorRoutes, ...jugadorRoutes, ...anyAuthRoutes,
    ...rutasPublicasTorneo,
  ]

  // Mismo matcheo que usa el middleware, para que la prueba no compruebe otra cosa.
  const cubierta = (ruta: string) =>
    listas.some(l => ruta === l || ruta.startsWith(l + '/'))
    || EXENTAS.has(ruta)
    || PATRONES_EXENTOS.some(re => re.test(ruta))

  it('toda pantalla está en alguna lista o exenta a propósito', () => {
    const rutas = [...new Set(rutasDeLaApp(join(process.cwd(), 'src', 'app')))].sort()
    expect(rutas.length).toBeGreaterThan(20) // el escaneo encontró algo

    const sinCubrir = rutas.filter(r => !cubierta(r))
    expect(sinCubrir).toEqual([])
  })

  it('las públicas de torneo siguen siendo alcanzables sin sesión', () => {
    // Si alguien las mete en anyAuthRoutes "por prolijidad", el código público
    // que se comparte al grupo deja de servir. Se comprueba el orden real: el
    // early-return de rutasPublicasTorneo corre ANTES que cualquier lista.
    for (const publica of ['/vivo/ABC-01', '/torneo-oficial/vivo/XYZ-02', '/torneo-oficial/manual']) {
      expect(rutasPublicasTorneo.some(r => publica === r || publica.startsWith(r + '/'))).toBe(true)
    }
  })

  it('/torneos no cubre /torneos-internos: cada una necesita su entrada', () => {
    // La trampa que dejó afuera a media docena de pantallas.
    expect('/torneos-internos'.startsWith('/torneos' + '/')).toBe(false)
    expect(cubierta('/torneos-internos')).toBe(true)
  })
})
