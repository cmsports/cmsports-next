import { createClient } from '@/lib/supabase/server'
import { esAdminDeClub } from '@/lib/auth/roles'

// Helpers de autorización compartidos por las Server Actions.
// Antes cada archivo tenía su propia copia — un solo lugar donde auditar
// la lógica de acceso evita que las copias se desincronicen.

/**
 * Quién está llamando, sin viaje a Supabase Auth.
 *
 * Antes cada `require*` hacía `getUser()`, que le pregunta al servidor de Auth
 * si la sesión sigue válida: un viaje entero (medido en producción el
 * 2026-09-12: 48 ms con el servidor caliente, 389 recién despierto) antes de
 * hacer nada, en cada uno de los ~200 clics que escriben. `getClaims()`
 * verifica la firma del token acá mismo con la llave pública del proyecto
 * (ES256, ya activa) —1,7 ms— y es exactamente lo que el middleware usa desde
 * hace tiempo para dejar pasar o no cada navegación.
 *
 * Lo que se pierde: una sesión revocada desde el panel sigue pasando la firma
 * hasta que el token vence (una hora). No cambia nada práctico: cada helper
 * consulta `perfiles` justo después, así que un usuario borrado o sin rol se
 * rechaza igual, y las operaciones de plata vuelven a verificar al usuario
 * dentro de la base (`auth.uid()` en cada RPC).
 */
async function usuarioActual(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ id: string } | null> {
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return typeof sub === 'string' && sub ? { id: sub } : null
}

// Admin del club (el más usado). Incluye `nombre` como superset: quien solo
// necesita clubId lo ignora; finanzas lo usa para el "registrado_por".
export async function requireAdminClub() {
  const supabase = await createClient()
  const user = await usuarioActual(supabase)
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null, nombre: null, userId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || !esAdminDeClub(perfil.rol) || !perfil.club_id) {
    return { error: 'Acceso denegado' as const, supabase: null, clubId: null, nombre: null, userId: null }
  }
  return { error: null, supabase, clubId: perfil.club_id, nombre: perfil.nombre, userId: user.id }
}

// Staff del club: admin, superadmin o profesor, siempre con club asignado.
// Lo usan horario, vouchers y las dos tiendas — que hasta la auditoría del
// 2026-08-08 tenían cada una su copia local idéntica de esta misma función.
// Eran cuatro copias sin divergencias todavía, que es exactamente el momento
// de juntarlas: el próximo que cambie el criterio de rol en una sola de ellas
// deja las otras tres abiertas y nadie se entera.
//
// Devuelve también el `nombre` para poder dejar rastro de quién escribió, sin
// que cada acción tenga que volver a consultar `perfiles`. Es aditivo: quien no
// lo use sigue igual.
export async function requireStaffClub() {
  const supabase = await createClient()
  const user = await usuarioActual(supabase)
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null, nombre: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil?.club_id || !['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Acceso denegado' as const, supabase: null, clubId: null, nombre: null }
  }
  return { error: null, supabase, clubId: perfil.club_id, nombre: perfil.nombre }
}

// Admin devolviendo el perfil completo (id, club_id, rol, nombre) — torneos.
export async function requireAdmin() {
  const supabase = await createClient()
  const user = await usuarioActual(supabase)
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || !esAdminDeClub(perfil.rol)) return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil }
}

// Superadmin — gestión multi-club.
export async function requireSuperadmin() {
  const supabase = await createClient()
  const user = await usuarioActual(supabase)
  if (!user) return { error: 'No autenticado' as const, supabase: null }
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'superadmin') return { error: 'Acceso denegado' as const, supabase: null }
  return { error: null, supabase }
}

// Cualquier perfil con club asignado (staff o jugador) — asistencia.
export async function requirePerfil() {
  const supabase = await createClient()
  const user = await usuarioActual(supabase)
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,jugador_id').eq('id', user.id).single()
  if (!perfil || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil: { ...perfil, club_id: perfil.club_id } }
}
