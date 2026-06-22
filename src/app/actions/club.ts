'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

export async function actualizarClubAction(datos: {
  nombre: string
  ciudad: string
  deporte: string
  mensualidadBase: number
}) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  if (!datos.nombre.trim()) return { error: 'El nombre del club es obligatorio' }
  if (datos.mensualidadBase < 0) return { error: 'La mensualidad no puede ser negativa' }

  const { error: updateError } = await supabase!.from('clubes').update({
    nombre: datos.nombre.trim(),
    ciudad: datos.ciudad.trim() || null,
    deporte: datos.deporte.trim() || null,
    mensualidad_base: datos.mensualidadBase,
  }).eq('id', clubId!)

  if (updateError) return { error: updateError.message }
  return { ok: true }
}
