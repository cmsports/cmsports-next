import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

const publicRoutes = ['/login', '/registro']
// Accesibles siempre, con o sin sesión — el link de invite/recovery crea sesión
// justo al llegar y no debe redirigir antes de que el usuario fije su contraseña.
const authFlowRoutes = ['/crear-contrasena', '/recuperar-contrasena']

const superadminRoutes = ['/superadmin']
const adminRoutes = ['/dashboard', '/finanzas', '/mensualidades', '/reportes', '/solicitudes']
const profesorRoutes = ['/dashboard-profesor']
const jugadorRoutes = ['/perfil', '/mis-clases', '/estado-cuenta', '/torneos-externos']

function getRolRedirect(rol: string | null): string {
  if (rol === 'superadmin') return '/superadmin'
  if (rol === 'admin') return '/dashboard'
  if (rol === 'profesor') return '/dashboard-profesor'
  return '/perfil'
}

export async function proxy(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Flujo de crear/recuperar contraseña — siempre accesible, no redirigir
  if (authFlowRoutes.some((r) => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Public routes — allow without auth
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    if (user) {
      // Already logged in, redirect to their home
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

      const url = request.nextUrl.clone()
      url.pathname = getRolRedirect(perfil?.rol ?? null)
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  }

  // No cookie session — let client-side auth handle it
  if (!user) {
    return supabaseResponse
  }

  // Get user role for route protection
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const rol = perfil?.rol ?? 'jugador'

  // Route protection by role
  if (
    superadminRoutes.some((r) => pathname === r || pathname.startsWith(r + '/')) &&
    rol !== 'superadmin'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (
    adminRoutes.some((r) => pathname === r || pathname.startsWith(r + '/')) &&
    rol !== 'admin' &&
    rol !== 'superadmin'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (
    profesorRoutes.some((r) => pathname === r || pathname.startsWith(r + '/')) &&
    rol !== 'profesor' &&
    rol !== 'admin' &&
    rol !== 'superadmin'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (
    jugadorRoutes.some((r) => pathname === r || pathname.startsWith(r + '/')) &&
    rol !== 'jugador'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
