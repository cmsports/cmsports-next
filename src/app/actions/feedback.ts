'use server'

import { requirePerfil } from '@/lib/auth/require'

const STAFF = ['admin', 'superadmin', 'profesor']

export async function crearFeedback(params: {
  jugadorId: string
  fecha: string
  hora?: string | null
  comentario: string
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden dejar feedback' }
  }
  const comentario = params.comentario.trim()
  if (!comentario) return { error: 'El comentario no puede estar vacío' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { data: autorPerfil } = await supabase.from('perfiles').select('nombre').eq('id', user.id).single()

  const { error } = await supabase.from('feedback_jugadores').insert({
    club_id: perfil.club_id,
    jugador_id: params.jugadorId,
    autor_id: user.id,
    autor_nombre: autorPerfil?.nombre || 'Staff',
    fecha: params.fecha,
    hora: params.hora || null,
    comentario,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function editarFeedback(params: {
  feedbackId: string
  fecha: string
  hora?: string | null
  comentario: string
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden editar feedback' }
  }
  const comentario = params.comentario.trim()
  if (!comentario) return { error: 'El comentario no puede estar vacío' }

  // El resto de la autorización (admin puede cualquiera, el profesor solo lo
  // suyo) lo impone la RLS de feedback_editar: si no puede, esto simplemente
  // no actualiza ninguna fila.
  const { error } = await supabase.from('feedback_jugadores').update({
    fecha: params.fecha,
    hora: params.hora || null,
    comentario,
    editado_en: new Date().toISOString(),
  }).eq('id', params.feedbackId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function eliminarFeedback(params: { feedbackId: string }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden borrar feedback' }
  }

  const { error } = await supabase.from('feedback_jugadores').delete().eq('id', params.feedbackId)
  if (error) return { error: error.message }
  return { success: true }
}
