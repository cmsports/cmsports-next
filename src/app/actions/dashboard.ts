'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONFIG } from '@/lib/config'

export async function aprobarSolicitud(input: {
  solicitudId: string
  clubId: string
  categoria: string
  tipoPlan: string
  entrenamientosPorSemana: number | null
  mensualidad: number
  sesionesLimite: number
  origin: string
}) {
  const supabase = await createClient()

  const { data: sol } = await supabase
    .from('solicitudes_jugador')
    .select('*')
    .eq('id', input.solicitudId)
    .eq('club_id', input.clubId)
    .eq('estado', 'pendiente')
    .single()

  if (!sol) {
    return { error: 'Solicitud no encontrada o ya procesada' }
  }
  if (!sol.email) {
    return { error: 'La solicitud no tiene email — no se puede invitar al jugador' }
  }

  const { data: nuevoJugador, error: insertError } = await supabase
    .from('jugadores')
    .insert({
      club_id: input.clubId,
      nombre: sol.nombre,
      rut: sol.rut,
      email: sol.email,
      telefono: sol.telefono,
      categoria: input.categoria,
      tipo_plan: input.tipoPlan,
      entrenamientos_por_semana: input.entrenamientosPorSemana,
      mensualidad: input.mensualidad,
      sesiones_limite: input.sesionesLimite,
      elo: CONFIG.ELO_INICIAL,
      sesiones_usadas: 0,
      estado: 'activo',
      es_externo: false,
    })
    .select()
    .single()

  if (insertError || !nuevoJugador) {
    return { error: 'Error al crear jugador' }
  }

  const { error: updateError } = await supabase
    .from('solicitudes_jugador')
    .update({ estado: 'aprobado' })
    .eq('id', input.solicitudId)

  if (updateError) {
    return { error: 'Error al actualizar solicitud' }
  }

  const admin = createAdminClient()
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    sol.email,
    { redirectTo: `${input.origin}/crear-contrasena` },
  )

  if (inviteError || !invited?.user) {
    return { success: true, inviteError: inviteError?.message || 'No se pudo enviar la invitación' }
  }

  const { error: perfilError } = await admin.from('perfiles').insert({
    id: invited.user.id,
    club_id: input.clubId,
    nombre: sol.nombre,
    email: sol.email,
    rol: 'jugador',
    jugador_id: nuevoJugador.id,
  })

  if (perfilError) {
    return { success: true, inviteError: 'Usuario invitado pero falló crear el perfil: ' + perfilError.message }
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
