'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'

const profesorSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del profesor'),
  email: z.string().transform(value => value.replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase()).pipe(z.string().email('Ingresa un correo válido')),
  especialidad: z.string().trim(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export async function crearProfesor(input: z.infer<typeof profesorSchema>) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase || !clubId) return { error: authErr }
  const parsed = profesorSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data
  const email = data.email
  const admin = createAdminClient()

  const { data: usuario, error: usuarioError } = await admin.auth.admin.createUser({
    email, password: data.password, email_confirm: true, user_metadata: { nombre: data.nombre },
  })
  if (usuarioError || !usuario.user) {
    return { error: usuarioError?.message?.toLowerCase().includes('already') ? 'Ese correo ya tiene una cuenta' : 'No se pudo crear la cuenta del profesor' }
  }

  const { data: profesor, error: profesorError } = await admin.from('profesores').insert({
    club_id: clubId, nombre: data.nombre, email, especialidad: data.especialidad || null, activo: true,
  }).select('id').single()
  if (profesorError || !profesor) {
    await admin.auth.admin.deleteUser(usuario.user.id)
    return { error: 'No se pudo crear el profesor' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: usuario.user.id, club_id: clubId, nombre: data.nombre, email, rol: 'profesor', jugador_id: null,
  }, { onConflict: 'id' })
  if (perfilError) {
    await admin.from('profesores').delete().eq('id', profesor.id)
    await admin.auth.admin.deleteUser(usuario.user.id)
    return { error: 'No se pudo vincular el acceso del profesor' }
  }

  revalidatePath('/configuracion')
  return { success: true }
}

export async function cambiarEstadoProfesor(input: { profesorId: string; activo: boolean }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase || !clubId) return { error: authErr }
  if (!z.string().uuid().safeParse(input.profesorId).success) return { error: 'Profesor inválido' }

  const { data: profesor, error } = await supabase.from('profesores')
    .update({ activo: input.activo }).eq('id', input.profesorId).eq('club_id', clubId)
    .select('email').single()
  if (error || !profesor) return { error: 'No se pudo actualizar el profesor' }

  const admin = createAdminClient()
  const { data: perfil } = profesor.email
    ? await admin.from('perfiles').select('id').eq('club_id', clubId).eq('rol', 'profesor').eq('email', profesor.email).maybeSingle()
    : { data: null }
  if (perfil) await admin.auth.admin.updateUserById(perfil.id, { ban_duration: input.activo ? 'none' : '876000h' })

  revalidatePath('/configuracion')
  return { success: true }
}
