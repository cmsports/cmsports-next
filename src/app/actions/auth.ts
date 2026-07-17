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
  const { data, error } = await supabase.rpc('crear_solicitud_jugador', {
    p_codigo: parsed.data.codigo,
    p_club_id: parsed.data.club_id,
    p_nombre: parsed.data.nombre,
    p_rut: parsed.data.rut,
    p_email: parsed.data.email,
    p_telefono: parsed.data.telefono || null,
  })

  if (error) return { error: 'Error al enviar solicitud. Intenta de nuevo.' }

  // 042 retorna NULL para códigos inválidos: así PostgreSQL conserva la cuota
  // consumida en vez de revertirla junto con una excepción.
  if (data === null) return { error: 'Link de invitación inválido o expirado' }
  return { success: true }
}
