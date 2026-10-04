'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { esUuid } from '@/lib/domain/uuid'
import { fechaChile } from '@/lib/domain/fechaChile'

/** Retiro declarado y vuelta al club: una transición atómica con historial. */
export async function registrarPermanencia(params: {
  jugadorId: string
  tipo: 'retiro' | 'reingreso'
  fecha: string
  motivo: string
}) {
  const { error: authError, supabase, clubId } = await requireAdminClub()
  if (authError || !supabase || !clubId) return { error: authError ?? 'Acceso denegado' }
  if (!params || !esUuid(params.jugadorId) || !['retiro', 'reingreso'].includes(params.tipo)) {
    return { error: 'Jugador o movimiento inválido' }
  }
  if (typeof params.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(params.fecha)
    || !Number.isFinite(Date.parse(`${params.fecha}T12:00:00Z`))
    || new Date(`${params.fecha}T12:00:00Z`).toISOString().slice(0, 10) !== params.fecha
    || params.fecha > fechaChile()) return { error: 'Fecha inválida o futura' }
  const motivo = typeof params.motivo === 'string' ? params.motivo.trim() : ''
  if (!motivo || motivo.length > 500) return { error: 'Indica un motivo de hasta 500 caracteres' }
  const { data: club, error: clubError } = await supabase.from('clubes')
    .select('modulos_habilitados').eq('id', clubId).single()
  if (clubError || !club?.modulos_habilitados?.includes('indicador_bajas_club')) {
    return { error: 'El club no tiene habilitado el historial de permanencia' }
  }
  // El RPC vuelve a verificar sesión, club, módulo, jugador y orden de fechas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('registrar_permanencia_jugador', {
    p_jugador_id: params.jugadorId, p_tipo: params.tipo,
    p_fecha: params.fecha, p_motivo: motivo,
  })
  if (error) return { error: error.message }
  if (!data) return { error: 'No se confirmó el movimiento' }
  return { success: true }
}
