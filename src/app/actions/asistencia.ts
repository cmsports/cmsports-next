'use server'

import { requirePerfil } from '@/lib/auth/require'

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
  // Incremento atómico: evita perder check-ins simultáneos
  await supabase.rpc('ajustar_sesiones', { p_jugador_id: jugadorId, p_delta: 1 })
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
    // Decremento atómico con piso en 0 (lo garantiza la función SQL)
    await supabase.rpc('ajustar_sesiones', { p_jugador_id: asistencia.jugador_id, p_delta: -1 })
  }

  return { ok: true }
}
