import { createClient } from '@/lib/supabase/server'
import { esAdminDeClub } from '@/lib/auth/roles'

// Helpers de autorización compartidos por las Server Actions.
// Antes cada archivo tenía su propia copia — un solo lugar donde auditar
// la lógica de acceso evita que las copias se desincronicen.

// Admin del club (el más usado). Incluye `nombre` como superset: quien solo
// necesita clubId lo ignora; finanzas lo usa para el "registrado_por".
export async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null, nombre: null, userId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || !esAdminDeClub(perfil.rol) || !perfil.club_id) {
    return { error: 'Acceso denegado' as const, supabase: null, clubId: null, nombre: null, userId: null }
  }
  return { error: null, supabase, clubId: perfil.club_id, nombre: perfil.nombre, userId: user.id }
}

// Admin devolviendo el perfil completo (id, club_id, rol, nombre) — torneos.
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || !esAdminDeClub(perfil.rol)) return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil }
}

// Superadmin — gestión multi-club.
export async function requireSuperadmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null }
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'superadmin') return { error: 'Acceso denegado' as const, supabase: null }
  return { error: null, supabase }
}

// Cualquier perfil con club asignado (staff o jugador) — asistencia.
export async function requirePerfil() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,jugador_id').eq('id', user.id).single()
  if (!perfil || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil: { ...perfil, club_id: perfil.club_id } }
}
