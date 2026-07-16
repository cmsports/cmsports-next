'use server'

import { createClient } from '@/lib/supabase/server'
import { solicitudSchema } from '@/lib/validations/auth'

export async function registrarSolicitud(input: {
  nombre: string
  rut: string
  email: string
  telefono: string
  club_id: string
  codigo: string
}) {
  const parsed = solicitudSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const rpcParams = {
    p_codigo: parsed.data.codigo,
    p_club_id: parsed.data.club_id,
    p_nombre: parsed.data.nombre,
    p_rut: parsed.data.rut,
    p_email: parsed.data.email,
    p_telefono: parsed.data.telefono || null,
  }
  const { error } = await supabase.rpc('crear_solicitud_jugador', rpcParams)

  if (error) {
    const mensaje = error.message.toLowerCase()
    const rpcAunNoAplicada = error.code === 'PGRST202' || mensaje.includes('crear_solicitud_jugador') && mensaje.includes('schema cache')
    if (rpcAunNoAplicada) {
      // Compatibilidad durante el despliegue: la versión nueva puede publicarse
      // antes de aplicar 038. Nunca vuelve a guardar una contraseña.
      const { data: inv } = await supabase.rpc('validar_invitacion', {
        p_codigo: parsed.data.codigo,
        p_club_id: parsed.data.club_id,
      })
      if (!inv?.length) return { error: 'Link de invitación inválido o expirado' }
      const { error: insertError } = await supabase.from('solicitudes_jugador').insert({
        club_id: parsed.data.club_id,
        nombre: parsed.data.nombre,
        rut: parsed.data.rut,
        email: parsed.data.email,
        telefono: parsed.data.telefono || null,
        password: null,
      })
      if (!insertError) return { success: true }
    }
    if (mensaje.includes('invitación') || mensaje.includes('invitacion')) {
      return { error: 'Link de invitación inválido o expirado' }
    }
    return { error: 'Error al enviar solicitud. Intenta de nuevo.' }
  }
  return { success: true }
}
