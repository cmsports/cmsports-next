'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { solicitudSchema } from '@/lib/validations/auth'
import { encrypt } from '@/lib/crypto'

const registroSchema = solicitudSchema.extend({
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export async function registrarSolicitud(input: {
  nombre: string
  rut: string
  email: string
  telefono: string
  password: string
  club_id: string
  codigo: string
}) {
  const parsed = registroSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const { data: inv } = await supabase.rpc('validar_invitacion', {
    p_codigo: parsed.data.codigo,
    p_club_id: parsed.data.club_id,
  })
  if (!inv?.length) return { error: 'Link de invitación inválido o expirado' }

  const { error } = await supabase.from('solicitudes_jugador').insert({
    club_id: parsed.data.club_id,
    nombre: parsed.data.nombre,
    rut: parsed.data.rut,
    email: parsed.data.email || null,
    telefono: parsed.data.telefono || null,
    password: encrypt(input.password),
  })

  if (error) return { error: 'Error al enviar solicitud. Intenta de nuevo.' }
  return { success: true }
}
