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

export async function registrarBloqueAction(params: {
  clubId: string
  fecha: string
  hora: string
  presentes: string[]
  ausentes: string[]
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }

  const esStaff = perfil.rol === 'admin' || perfil.rol === 'profesor'
  if (!esStaff) return { error: 'Solo admin o profesor pueden cerrar bloques' }
  if (params.clubId !== perfil.club_id) return { error: 'Acceso denegado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('registrar_bloque_asistencia', {
    p_club_id:   params.clubId,
    p_fecha:     params.fecha,
    p_hora:      params.hora,
    p_presentes: params.presentes,
    p_ausentes:  params.ausentes,
  })
  if (error) return { error: error.message }

  return { ok: true }
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
