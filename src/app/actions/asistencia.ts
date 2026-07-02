'use server'

import { createClient } from '@/lib/supabase/server'

async function requirePerfil() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,jugador_id').eq('id', user.id).single()
  if (!perfil || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil: { ...perfil, club_id: perfil.club_id } }
}

export async function registrarAsistenciaAction(
  clubId: string,
  jugadorId: string,
  fecha: string,
  hora: string
) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }

  // Staff registra a cualquier jugador de su club; un jugador solo a sí mismo
  const esStaff = perfil.rol === 'admin' || perfil.rol === 'profesor'
  if (clubId !== perfil.club_id) return { error: 'Acceso denegado' }
  if (!esStaff && jugadorId !== perfil.jugador_id) return { error: 'Acceso denegado' }

  const { error } = await supabase.from('asistencia').insert({
    club_id: clubId,
    jugador_id: jugadorId,
    fecha,
    hora,
  })
  if (error) return { error: error.message }
  const { data: jugador } = await supabase
    .from('jugadores')
    .select('sesiones_usadas')
    .eq('id', jugadorId)
    .single()
  if (jugador) {
    await supabase
      .from('jugadores')
      .update({ sesiones_usadas: (jugador.sesiones_usadas || 0) + 1 })
      .eq('id', jugadorId)
  }
  return { ok: true }
}

export async function eliminarAsistencia(asistenciaId: string) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }
  if (perfil.rol !== 'admin' && perfil.rol !== 'profesor') {
    return { error: 'Solo el admin o profesor puede eliminar asistencias' }
  }

  const { data: asistencia } = await supabase
    .from('asistencia')
    .select('jugador_id')
    .eq('id', asistenciaId)
    .eq('club_id', perfil.club_id)
    .single()
  if (!asistencia) return { error: 'Asistencia no encontrada' }

  const { error } = await supabase.from('asistencia').delete().eq('id', asistenciaId)
  if (error) return { error: error.message }

  if (asistencia.jugador_id) {
    const { data: jugador } = await supabase
      .from('jugadores')
      .select('sesiones_usadas')
      .eq('id', asistencia.jugador_id)
      .single()
    if (jugador && (jugador.sesiones_usadas || 0) > 0) {
      await supabase
        .from('jugadores')
        .update({ sesiones_usadas: (jugador.sesiones_usadas || 0) - 1 })
        .eq('id', asistencia.jugador_id)
    }
  }

  return { ok: true }
}
