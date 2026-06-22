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

export async function aprobarSolicitud(params: {
  solicitudId: string
  nombre: string
  rut: string
  email: string
  telefono: string
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { solicitudId, nombre, rut, email, telefono, ...planFields } = params

  const { error: insertErr } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre, rut: rut || null, email: email || null, telefono: telefono || null,
    ...planFields, elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  })
  if (insertErr) return { error: 'Error al crear jugador: ' + insertErr.message }

  const { error: updateErr } = await supabase.from('solicitudes_jugador').update({ estado: 'aprobado' }).eq('id', solicitudId)
  if (updateErr) return { error: 'Jugador creado pero falló actualizar la solicitud' }

  return { success: true }
}

export async function rechazarSolicitud(params: { solicitudId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('solicitudes_jugador').update({ estado: 'rechazado' }).eq('id', params.solicitudId)
  if (error) return { error: 'Error al rechazar' }
  return { success: true }
}
