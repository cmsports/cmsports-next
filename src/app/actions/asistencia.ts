'use server'

import { createClient } from '@/lib/supabase/server'

export async function registrarAsistenciaAction(
  clubId: string,
  jugadorId: string,
  fecha: string,
  hora: string
) {
  const supabase = await createClient()
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

export async function eliminarAsistencia(asistenciaId: string, rolUsuario: string) {
  if (rolUsuario !== 'admin' && rolUsuario !== 'profesor') return { error: 'Solo el admin o profesor puede eliminar asistencias' }

  const supabase = await createClient()

  const { data: asistencia } = await supabase
    .from('asistencia')
    .select('jugador_id')
    .eq('id', asistenciaId)
    .single()

  const { error } = await supabase.from('asistencia').delete().eq('id', asistenciaId)
  if (error) return { error: error.message }

  if (asistencia?.jugador_id) {
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
