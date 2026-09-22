'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'

// Mismo saneo de correo que `profesores.ts`: los correos pegados desde
// WhatsApp traen espacios de ancho cero que no se ven y hacen fallar el login.
// Se repite en vez de importarse porque este archivo es 'use server': ahí todo
// lo exportado tiene que ser una función async, así que no puede salir una
// constante. Escrito con escapes a propósito — con los caracteres de verdad no
// se ve qué dice.
const LIMPIAR_CORREO = /[\s\u200B-\u200D\uFEFF]/g

const administradorSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del administrador'),
  email: z.string().transform(v => v.replace(LIMPIAR_CORREO, '').toLowerCase()).pipe(z.string().email('Ingresa un correo válido')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

/**
 * Crea otro administrador del mismo club.
 *
 * Hasta ahora Configuración solo sabía crear profesores, así que un club con
 * un solo admin no tenía forma de sumar un segundo sin pasar por el
 * superadmin. Un club que depende de una sola cuenta es un club a un olvido
 * de contraseña de quedarse afuera.
 *
 * Dos cosas que NO son negociables acá:
 *
 * 1. El `club_id` sale de `requireAdminClub()`, nunca del formulario. Si
 *    viniera del cliente, cualquier admin podría sembrarse un administrador
 *    dentro de otro club escribiendo otro id.
 * 2. El rol se escribe fijo en `'admin'`. Tampoco es un parámetro: un rol que
 *    viaja desde el navegador es la misma puerta con otro nombre — hoy se
 *    usaría para 'admin' y mañana alguien manda 'superadmin'.
 *
 * A diferencia de `crearProfesor`, esto NO inserta en `profesores`: un
 * administrador no dicta clases ni tiene bloques. Solo cuenta y perfil.
 */
export async function crearAdministrador(input: z.infer<typeof administradorSchema>) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase || !clubId) return { error: authErr }
  const parsed = administradorSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { nombre, email, password } = parsed.data

  const admin = createAdminClient()

  const { data: usuario, error: usuarioError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre },
  })
  if (usuarioError || !usuario.user) {
    return {
      error: usuarioError?.message?.toLowerCase().includes('already')
        ? 'Ese correo ya tiene una cuenta'
        : 'No se pudo crear la cuenta del administrador',
    }
  }

  // Si el perfil falla se borra el usuario recién creado. Dejarlo suelto es
  // peor que no haberlo creado: el correo queda ocupado, la persona no puede
  // entrar a ningún lado, y el siguiente intento choca con "ya tiene cuenta"
  // sin que se entienda por qué. Mismo rescate que en `crearProfesor`.
  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: usuario.user.id, club_id: clubId, nombre, email, rol: 'admin', jugador_id: null,
  }, { onConflict: 'id' })
  if (perfilError) {
    await admin.auth.admin.deleteUser(usuario.user.id)
    return { error: 'No se pudo vincular el acceso del administrador' }
  }

  revalidatePath('/configuracion')
  return { success: true }
}

/**
 * Los administradores del club, para que se vea con quién se comparte el
 * mando antes de sumar otro.
 *
 * Va por Server Action y no por consulta del cliente para devolver siempre la
 * lista del club de quien pregunta, sin depender de que el filtro por
 * `club_id` esté bien escrito en cada pantalla que la quiera mostrar.
 */
export async function listarAdministradores() {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase || !clubId) return { error: authErr, administradores: [] }

  const { data, error } = await supabase.from('perfiles')
    .select('id,nombre,email').eq('club_id', clubId).eq('rol', 'admin').order('nombre')
  if (error) return { error: 'No se pudo leer la lista de administradores', administradores: [] }

  return { error: null, administradores: data ?? [] }
}
