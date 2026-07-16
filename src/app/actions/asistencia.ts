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

  const esStaff = perfil.rol === 'admin' || perfil.rol === 'profesor'
  if (clubId !== perfil.club_id) return { error: 'Acceso denegado' }
  if (!esStaff && jugadorId !== perfil.jugador_id) return { error: 'Acceso denegado' }

  // Para el jugador, PostgreSQL fija fecha y hora en America/Santiago.
  // Así no dependemos del UTC ni del reloj configurado en su dispositivo.
  const args = esStaff
    ? { p_jugador_id: jugadorId, p_fecha: fecha, p_hora: hora }
    : { p_jugador_id: jugadorId }
  const { data, error } = await supabase.rpc('registrar_asistencia_segura', args)
  if (error) return { error: error.message }

  return { ok: true, asistenciaId: data as string }
}

export async function eliminarAsistencia(asistenciaId: string) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }
  if (perfil.rol !== 'admin' && perfil.rol !== 'profesor') {
    return { error: 'Solo el admin o profesor puede eliminar asistencias' }
  }

  const { error } = await supabase.rpc('eliminar_asistencia_segura', {
    p_asistencia_id: asistenciaId,
  })
  if (error) return { error: error.message }

  return { ok: true }
}
