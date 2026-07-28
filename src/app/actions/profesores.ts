'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'

// Los correos pegados desde WhatsApp traen espacios de ancho cero: no se ven,
// pero el login falla y nadie entiende por qué. Va en una constante para que
// los dos formularios saneen igual y para no volver a escribirlo con los
// caracteres invisibles adentro.
const LIMPIAR_CORREO = /[\s\u200B-\u200D\uFEFF]/g

const profesorSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del profesor'),
  email: z.string().transform(value => value.replace(LIMPIAR_CORREO, '').toLowerCase()).pipe(z.string().email('Ingresa un correo válido')),
  especialidad: z.string().trim(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

const accesoSchema = z.object({
  profesorId: z.string().uuid('Profesor inválido'),
  email: z.string().transform(value => value.replace(LIMPIAR_CORREO, '').toLowerCase()).pipe(z.string().email('Ingresa un correo válido')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

/**
 * Le da acceso a un profesor que ya existe en la ficha.
 *
 * `crearProfesor` inserta uno nuevo, así que no sirve para esto: los profesores
 * cargados a mano ya tienen bloques asignados, y crear otro con el mismo nombre
 * dejaría los bloques colgando del que nadie usa y dos fichas iguales en la
 * lista. Acá se crea la cuenta y se engancha a la ficha que ya está.
 */
export async function crearAccesoProfesor(input: z.infer<typeof accesoSchema>) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase || !clubId) return { error: authErr }
  const parsed = accesoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { profesorId, email, password } = parsed.data

  const admin = createAdminClient()

  const { data: profesor } = await admin.from('profesores')
    .select('id,nombre,email').eq('id', profesorId).eq('club_id', clubId).maybeSingle()
  if (!profesor) return { error: 'Ese profesor no es de este club' }
  if (profesor.email) return { error: 'Ese profesor ya tiene una cuenta' }

  const { data: usuario, error: usuarioError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre: profesor.nombre },
  })
  if (usuarioError || !usuario.user) {
    return { error: usuarioError?.message?.toLowerCase().includes('already') ? 'Ese correo ya tiene una cuenta' : 'No se pudo crear la cuenta del profesor' }
  }

  // Si algo falla de acá en adelante se borra el usuario recién creado: dejarlo
  // suelto es peor que no haberlo creado, porque el correo queda ocupado y el
  // siguiente intento choca sin que se entienda por qué.
  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: usuario.user.id, club_id: clubId, nombre: profesor.nombre, email, rol: 'profesor', jugador_id: null,
  }, { onConflict: 'id' })
  if (perfilError) {
    await admin.auth.admin.deleteUser(usuario.user.id)
    return { error: 'No se pudo vincular el acceso del profesor' }
  }

  const { error: fichaError } = await admin.from('profesores')
    .update({ email }).eq('id', profesorId).eq('club_id', clubId)
  if (fichaError) {
    await admin.from('perfiles').delete().eq('id', usuario.user.id)
    await admin.auth.admin.deleteUser(usuario.user.id)
    return { error: 'No se pudo guardar el correo en la ficha del profesor' }
  }

  revalidatePath('/configuracion')
  return { success: true }
}

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
