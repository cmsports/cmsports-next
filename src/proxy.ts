import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

const publicRoutes = ['/login', '/registro']

const adminRoutes = ['/dashboard', '/finanzas', '/mensualidades', '/asistencia-stats', '/reportes', '/solicitudes']
const profesorRoutes = ['/dashboard-profesor', '/asistencia']
const jugadorRoutes = ['/perfil', '/mis-clases', '/estado-cuenta', '/torneos-externos']

function getRolRedirect(rol: string | null): string {
  if (rol === 'admin') return '/dashboard'
  if (rol === 'profesor') return '/dashboard-profesor'
  return '/perfil'
}

export async function proxy(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

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

  // Not authenticated — redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Get user role for route protection
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const rol = perfil?.rol ?? 'jugador'

  // Route protection by role
  if (adminRoutes.some((r) => pathname.startsWith(r)) && rol !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (profesorRoutes.some((r) => pathname.startsWith(r)) && rol !== 'profesor' && rol !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (jugadorRoutes.some((r) => pathname.startsWith(r)) && rol !== 'jugador') {
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
