import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { MODULOS_CLUB, puedeAccederModulo } from '@/lib/auth/modulos-rutas'
import { esAdminDeClub } from '@/lib/auth/roles'
import { esCuentaDemo } from '@/lib/auth/demo'
import { pathCanonicoMiAcceso } from '@/lib/domain/clubSlug'
import type { Database } from '@/types/database'

const publicRoutes = ['/login', '/registro']
// Accesibles siempre, con o sin sesión — el link de invite/recovery crea sesión
// justo al llegar y no debe redirigir antes de que el usuario fije su contraseña.
const authFlowRoutes = ['/crear-contrasena', '/recuperar-contrasena']

const superadminRoutes = ['/superadmin']
// '/credenciales' es admin-only: muestra contraseñas en texto plano. Se sumó
// a la auditoría del 31 de julio — quedaba fuera de todas estas listas, así
// que sin sesión el middleware la dejaba pasar en vez de mandarla a /login
// (el propio componente igual redirige, pero un rato después y en el
// navegador, no al toque en el servidor como el resto de las pantallas admin).
const adminRoutes = ['/dashboard', '/finanzas', '/mensualidades', '/liga', '/reportes', '/solicitudes', '/credenciales']
// El profesor necesita abrir el listado y la ficha para evaluar. Las acciones
// administrativas dentro de esas pantallas siguen reservadas al admin.
const staffRoutes = ['/jugadores']
const profesorRoutes = ['/dashboard-profesor']
const jugadorRoutes = ['/perfil', '/estado-cuenta', '/mi-horario']
// '/ranking' también quedaba fuera de todas las listas y por eso no
// redirigía al login desde el servidor. Va acá y no en adminRoutes: el
// jugador también entra a ver su propio ranking, filtrado por categoría.
const anyAuthRoutes = ['/torneos', '/calendario', '/asistencia', '/clases', '/horario', '/tienda', '/configuracion', '/cuenta-bloqueada', '/ranking', '/tecnico']

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
  // /mi-acceso es el link del grupo: el jugador pone su RUT y ve su clave,
  // sin sesión. Si lo metemos en publicRoutes, un admin logueado no podría
  // abrir el link para probarlo — lo rebotaría al dashboard.
  //
  // El UUID de Buin redirige a /mi-acceso/buin: el link viejo no se rompe y
  // el que se copia al grupo se puede leer en voz alta.
  const miAccesoCorto = pathCanonicoMiAcceso(pathname)
  if (miAccesoCorto && miAccesoCorto !== pathname) {
    const url = request.nextUrl.clone()
    url.pathname = miAccesoCorto
    return NextResponse.redirect(url)
  }
  if (/^\/asistencia\/[^/]+$/.test(pathname) || /^\/mi-acceso\/[^/]+$/.test(pathname)) {
    return supabaseResponse
  }

  // Flujo de crear/recuperar contraseña — siempre accesible, no redirigir.
  // Salvo la cuenta demo: este early-return corría antes que su bloqueo de
  // más abajo y lo dejaba muerto, así que la demo sí podía cambiar la clave.
  if (authFlowRoutes.some((r) => pathname.startsWith(r))) {
    if (user && esCuentaDemo(user.email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // El perfil se busca una sola vez y se reusa más abajo. Antes se consultaba
  // dos veces —acá y en la protección por rol—, y peor: cada rama sacaba su
  // propia conclusión de lo que significaba no encontrarlo.
  const { data: perfil } = user
    ? await supabase
        .from('perfiles')
        .select('rol,club_id,jugador_id')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }

  // Token vivo de alguien que ya no está en `perfiles`: lo eliminaron del club
  // y su sesión todavía no vence.
  //
  // Es el caso que colgaba la pantalla. `getClaims()` solo verifica la firma
  // del token, no que el usuario exista, así que el middleware lo daba por
  // logueado; la pantalla no encontraba perfil y lo mandaba a /login; y /login
  // veía "sesión activa", llamaba a getRolRedirect(null) —que devuelve
  // /perfil— y lo mandaba de vuelta. Ida y vuelta hasta que venciera el token.
  //
  // Va antes que las rutas públicas a propósito: si no, /login lo sigue
  // rebotando. /sin-club le cierra la sesión y le ofrece postular de nuevo.
  if (user && !perfil) {
    if (pathname === '/sin-club') return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/sin-club'
    return NextResponse.redirect(url)
  }

  // Public routes — allow without auth
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    if (user) {
      // Already logged in, redirect to their home
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

  // Llegar acá con `perfil` nulo ya no es posible: ese caso se desvía a
  // /sin-club más arriba. El `?? 'jugador'` que había era justamente lo que le
  // inventaba un rol al usuario borrado y lo metía en el ciclo.
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

  // Cuenta demo: bloquear configuracion y redes-sociales. Los flujos de
  // contraseña se bloquean arriba, en el early-return de authFlowRoutes.
  if (esCuentaDemo(user.email)) {
    if (pathname.startsWith('/configuracion') || pathname.startsWith('/redes-sociales')) {
      const url = request.nextUrl.clone()
      url.pathname = getRolRedirect(rol)
      return NextResponse.redirect(url)
    }
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

  // Verificar si el jugador está bloqueado por morosidad (service role → ignora RLS)
  if (rol === 'jugador' && pathname !== '/cuenta-bloqueada' && !pathname.startsWith('/api/')) {
    const adminSsr = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )
    let esBloqueado = false
    if (perfil?.jugador_id) {
      const { data: jug } = await adminSsr
        .from('jugadores').select('estado').eq('id', perfil.jugador_id).single()
      esBloqueado = jug?.estado === 'bloqueado'
    } else {
      // jugador_id no vinculado en perfiles: buscar por email del usuario autenticado
      const email = user.email ?? ''
      if (email && perfil?.club_id) {
        const { data: jug } = await adminSsr
          .from('jugadores').select('estado')
          .eq('club_id', perfil.club_id).ilike('email', email).maybeSingle()
        esBloqueado = jug?.estado === 'bloqueado'
      }
    }
    if (esBloqueado) {
      const url = request.nextUrl.clone()
      url.pathname = '/cuenta-bloqueada'
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
