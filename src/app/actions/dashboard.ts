'use server'

import { createClient } from '@/lib/supabase/server'
import { CONFIG } from '@/lib/config'

export async function aprobarSolicitud(solicitudId: string, clubId: string) {
  const supabase = await createClient()

  const { data: sol } = await supabase
    .from('solicitudes_jugador')
    .select('*')
    .eq('id', solicitudId)
    .eq('club_id', clubId)
    .eq('estado', 'pendiente')
    .single()

  if (!sol) {
    return { error: 'Solicitud no encontrada o ya procesada' }
  }

  const { error: insertError } = await supabase.from('jugadores').insert({
    club_id: clubId,
    nombre: sol.nombre,
    rut: sol.rut,
    email: sol.email,
    telefono: sol.telefono,
    categoria: 'principiante',
    sesiones_limite: CONFIG.SESIONES_LIMITE_DEFAULT,
    elo: CONFIG.ELO_INICIAL,
    estado: 'activo',
    es_externo: false,
  })

  if (insertError) {
    return { error: 'Error al crear jugador' }
  }

  const { error: updateError } = await supabase
    .from('solicitudes_jugador')
    .update({ estado: 'aprobado' })
    .eq('id', solicitudId)

  if (updateError) {
    return { error: 'Error al actualizar solicitud' }
  }

  return { success: true }
}

export async function rechazarSolicitud(solicitudId: string, clubId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('solicitudes_jugador')
    .update({ estado: 'rechazado' })
    .eq('id', solicitudId)
    .eq('club_id', clubId)

  if (error) {
    return { error: 'Error al rechazar solicitud' }
  }

  return { success: true }
}
