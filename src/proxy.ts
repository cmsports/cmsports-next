import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { MODULOS_CLUB, puedeAccederModulo } from '@/lib/auth/modulos-rutas'
import { esAdminDeClub } from '@/lib/auth/roles'

const publicRoutes = ['/login', '/registro']
// Accesibles siempre, con o sin sesión — el link de invite/recovery crea sesión
// justo al llegar y no debe redirigir antes de que el usuario fije su contraseña.
const authFlowRoutes = ['/crear-contrasena', '/recuperar-contrasena']

const superadminRoutes = ['/superadmin']
const adminRoutes = ['/dashboard', '/finanzas', '/mensualidades', '/liga', '/reportes', '/solicitudes']
// El profesor necesita abrir el listado y la ficha para evaluar. Las acciones
// administrativas dentro de esas pantallas siguen reservadas al admin.
const staffRoutes = ['/redes-sociales', '/jugadores']
const profesorRoutes = ['/dashboard-profesor']
const jugadorRoutes = ['/perfil', '/mis-clases', '/estado-cuenta', '/torneos-externos']
const anyAuthRoutes = ['/torneos', '/calendario', '/asistencia', '/clases', '/tienda', '/configuracion']

function getRolRedirect(rol: string | null): string {
  if (rol === 'superadmin') return '/superadmin'
  if (rol === 'admin') return '/dashboard'
  if (rol === 'profesor') return '/dashboard-profesor'
  return '/perfil'
}

export async function proxy(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // El marcador por club usa un RPC seguro y debe funcionar en el dispositivo
  // de recepción sin iniciar sesión. La portada /asistencia sigue protegida.
  if (/^\/asistencia\/[^/]+$/.test(pathname)) {
    return supabaseResponse
  }

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

  // No cookie session — redirect protected route groups to login in the
  // server; the rest is handled client-side (RLS protects the data anyway)
  if (!user) {
    const protectedRoutes = [
      ...superadminRoutes, ...adminRoutes, ...staffRoutes, ...profesorRoutes, ...jugadorRoutes, ...anyAuthRoutes,
    ]
    if (protectedRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Get user role for route protection
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol,club_id')
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
    !esAdminDeClub(rol) && rol !== 'superadmin'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = getRolRedirect(rol)
    return NextResponse.redirect(url)
  }

  if (
    staffRoutes.some((r) => pathname === r || pathname.startsWith(r + '/')) &&
    rol === 'jugador'
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

  // Un módulo deshabilitado tampoco puede abrirse escribiendo su URL directa.
  const moduloProtegido = !puedeAccederModulo(pathname, [])
  if (moduloProtegido) {
    let modulosHabilitados: readonly string[] = []
    if (perfil?.club_id) {
      const { data: club, error: clubError } = await supabase
        .from('clubes')
        .select('modulos_habilitados')
        .eq('id', perfil.club_id)
        .single()
      if (!clubError && club) {
        modulosHabilitados = club.modulos_habilitados ?? MODULOS_CLUB
      }
    }

    if (!puedeAccederModulo(pathname, modulosHabilitados)) {
      const url = request.nextUrl.clone()
      url.pathname = getRolRedirect(rol)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
