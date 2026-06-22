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

type PlanFields = {
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}

export async function crearJugador(params: {
  nombre: string; rut: string; email: string; telefono: string
} & PlanFields) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { nombre, rut, email, telefono, ...planFields } = params
  const { error } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre: nombre.trim(), rut: rut || null, email: email || null, telefono: telefono || null,
    ...planFields, elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  })
  if (error) return { error: 'Error al crear: ' + error.message }
  return { success: true }
}

export async function editarJugador(params: {
  jugadorId: string; nombre: string; rut: string; email: string; telefono: string
} & PlanFields) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { jugadorId, nombre, rut, email, telefono, ...planFields } = params
  const { error } = await supabase.from('jugadores').update({
    nombre: nombre.trim(), rut: rut || null, email: email || null, telefono: telefono || null, ...planFields,
  }).eq('id', jugadorId)
  if (error) return { error: 'Error al editar: ' + error.message }
  return { success: true }
}

export async function toggleEstadoJugador(params: { jugadorId: string; nuevoEstado: 'activo' | 'bloqueado' }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('jugadores').update({ estado: params.nuevoEstado }).eq('id', params.jugadorId)
  if (error) return { error: 'Error al cambiar estado' }
  return { success: true }
}

export async function eliminarJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('jugadores').delete().eq('id', params.jugadorId)
  if (error) return { error: 'Error al eliminar' }
  return { success: true }
}
