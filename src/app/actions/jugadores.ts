'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  nombre: string; rut: string; email: string; password: string; telefono: string
} & PlanFields) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { nombre, rut, email, password, telefono, ...planFields } = params
  if (!email.trim()) return { error: 'El email es obligatorio' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  const { data: nuevoJugador, error } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre: nombre.trim(), rut: rut || null, email: email.trim(), telefono: telefono || null,
    ...planFields, elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select().single()
  if (error || !nuevoJugador) return { error: 'Error al crear: ' + error?.message }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: email.trim(), password, email_confirm: true,
  })
  if (createError || !creado?.user) {
    return { success: true, cuentaError: createError?.message || 'No se pudo crear la cuenta de acceso' }
  }

  const { error: perfilError } = await admin.from('perfiles').insert({
    id: creado.user.id, club_id: clubId, nombre: nombre.trim(), email: email.trim(),
    rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    return { success: true, cuentaError: 'Cuenta creada pero falló crear el perfil: ' + perfilError.message }
  }

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
