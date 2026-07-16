'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

export async function actualizarClubAction(datos: {
  nombre: string
  ciudad: string
  deporte: string
  mensualidadBase: number
}) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  if (!datos.nombre.trim()) return { error: 'El nombre del club es obligatorio' }
  if (datos.mensualidadBase < 0) return { error: 'La mensualidad no puede ser negativa' }

  const { error: updateError } = await supabase!.from('clubes').update({
    nombre: datos.nombre.trim(),
    ciudad: datos.ciudad.trim() || null,
    deporte: datos.deporte.trim() || null,
    mensualidad_base: datos.mensualidadBase,
  }).eq('id', clubId!)

  if (updateError) return { error: updateError.message }
  return { ok: true }
}

const perfilPersonalSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa tu nombre'),
  email: z.string().trim().email('Ingresa un correo válido'),
  telefono: z.string().trim().max(30),
  rut: z.string().trim().max(20),
  especialidad: z.string().trim().max(100),
})

export async function actualizarPerfilPersonalAction(input: z.infer<typeof perfilPersonalSchema>) {
  const parsed = perfilPersonalSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,jugador_id,email').eq('id', user.id).single()
  if (!perfil?.club_id) return { error: 'Perfil sin club asociado' }

  const data = parsed.data
  const email = data.email.toLowerCase()
  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email, email_confirm: true, user_metadata: { nombre: data.nombre },
  })
  if (authError) return { error: authError.message.toLowerCase().includes('already') ? 'Ese correo ya está en uso' : 'No se pudo actualizar el acceso' }

  const { error: perfilError } = await admin.from('perfiles').update({ nombre: data.nombre, email }).eq('id', user.id)
  if (perfilError) return { error: 'No se pudo actualizar el perfil' }

  if (perfil.rol === 'jugador' && perfil.jugador_id) {
    const { error } = await admin.from('jugadores').update({
      nombre: data.nombre, email, telefono: data.telefono || null, rut: data.rut || null,
    }).eq('id', perfil.jugador_id).eq('club_id', perfil.club_id)
    if (error) return { error: 'No se pudieron actualizar los datos del jugador' }
  }

  if (perfil.rol === 'profesor') {
    if (!perfil.email) return { error: 'El perfil del profesor no tiene correo asociado' }
    const { error } = await admin.from('profesores').update({
      nombre: data.nombre, email, especialidad: data.especialidad || null,
    }).eq('club_id', perfil.club_id).eq('email', perfil.email)
    if (error) return { error: 'No se pudieron actualizar los datos del profesor' }
  }

  return { success: true }
}
