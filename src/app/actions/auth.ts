'use server'

import { createClient } from '@/lib/supabase/server'
import { solicitudSchema } from '@/lib/validations/auth'

export async function enviarSolicitud(input: {
  nombre: string
  rut: string
  email: string
  telefono: string
  club_id: string
  codigo: string
}) {
  const parsed = solicitudSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invitaciones')
    .select('id')
    .eq('club_id', parsed.data.club_id)
    .eq('codigo', parsed.data.codigo)
    .eq('activa', true)
    .single()

  if (!inv) {
    return { error: 'Link de invitación inválido o expirado' }
  }

  const { error } = await supabase.from('solicitudes_jugador').insert({
    club_id: parsed.data.club_id,
    nombre: parsed.data.nombre,
    rut: parsed.data.rut,
    email: parsed.data.email || null,
    telefono: parsed.data.telefono || null,
  })

  if (error) {
    return { error: 'Error al enviar solicitud. Intenta de nuevo.' }
  }

  return { success: true }
}
