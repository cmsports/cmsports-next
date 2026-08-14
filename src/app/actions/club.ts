'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEmailAuth } from '@/lib/credencialesAuth'
import { nombreDesdePartes } from '@/lib/domain/nombreJugador'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'
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

const tallaSchema = z.string().trim().refine(
  valor => !valor || (TALLAS_UNIFORME as readonly string[]).includes(valor),
  'Talla inválida',
)

const perfilPersonalSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa tu nombre'),
  email: z.string().trim().email('Ingresa un correo válido'),
  telefono: z.string().trim().max(30),
  rut: z.string().trim().max(20),
  especialidad: z.string().trim().max(100),
  nombres: z.string().trim().max(80).optional().default(''),
  apellido1: z.string().trim().max(80).optional().default(''),
  apellido2: z.string().trim().max(80).optional().default(''),
  apellido3: z.string().trim().max(80).optional().default(''),
  fecha_nacimiento: z.string().trim().max(10).optional().default(''),
  direccion: z.string().trim().max(200).optional().default(''),
  comuna: z.string().trim().max(80).optional().default(''),
  contacto_emergencia_nombre: z.string().trim().max(120).optional().default(''),
  contacto_emergencia_telefono: z.string().trim().max(30).optional().default(''),
  indicaciones_medicas: z.string().trim().max(500).optional().default(''),
  talla_polera: tallaSchema.optional().default(''),
  talla_short: tallaSchema.optional().default(''),
})

function vacioANull(valor: string): string | null {
  return valor.trim() ? valor.trim() : null
}

export async function actualizarPerfilPersonalAction(input: z.input<typeof perfilPersonalSchema>) {
  const parsed = perfilPersonalSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,jugador_id,nombre,email').eq('id', user.id).single()
  if (!perfil?.club_id) return { error: 'Perfil sin club asociado' }

  const data = parsed.data
  const email = data.email.toLowerCase()
  const admin = createAdminClient()

  const restaurarAcceso = async () => admin.auth.admin.updateUserById(user.id, {
    email: perfil.email || user.email,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, nombre: perfil.nombre || user.user_metadata?.nombre },
  })

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email, email_confirm: true, user_metadata: { ...user.user_metadata, nombre: data.nombre },
  })
  if (authError) return { error: authError.message.toLowerCase().includes('already') ? 'Ese correo ya está en uso' : 'No se pudo actualizar el acceso' }

  const { error: perfilError } = await admin.from('perfiles').update({ nombre: data.nombre, email }).eq('id', user.id)
  if (perfilError) {
    await restaurarAcceso()
    return { error: 'No se pudo actualizar el perfil; el acceso anterior fue restaurado' }
  }

  const restaurarPerfilYAcceso = async () => {
    await Promise.all([
      admin.from('perfiles').update({ nombre: perfil.nombre, email: perfil.email }).eq('id', user.id),
      restaurarAcceso(),
    ])
  }

  if (perfil.rol === 'jugador' && perfil.jugador_id) {
    const compuesto = nombreDesdePartes(data)
    const nombre = compuesto || data.nombre
    if (nombre.length < 2) {
      await restaurarPerfilYAcceso()
      return { error: 'Ingresa tu nombre' }
    }
    const { error } = await admin.from('jugadores').update({
      nombre,
      email,
      telefono: vacioANull(data.telefono),
      rut: vacioANull(data.rut),
      nombres: vacioANull(data.nombres),
      apellido1: vacioANull(data.apellido1),
      apellido2: vacioANull(data.apellido2),
      apellido3: vacioANull(data.apellido3),
      fecha_nacimiento: vacioANull(data.fecha_nacimiento),
      direccion: vacioANull(data.direccion),
      comuna: vacioANull(data.comuna),
      contacto_emergencia_nombre: vacioANull(data.contacto_emergencia_nombre),
      contacto_emergencia_telefono: vacioANull(data.contacto_emergencia_telefono),
      indicaciones_medicas: vacioANull(data.indicaciones_medicas),
      talla_polera: vacioANull(data.talla_polera),
      talla_short: vacioANull(data.talla_short),
    }).eq('id', perfil.jugador_id).eq('club_id', perfil.club_id)
    if (error) {
      await restaurarPerfilYAcceso()
      return { error: 'No se pudieron actualizar los datos del jugador; se restauraron los datos anteriores' }
    }
    // Auth y perfiles ya llevaron el nombre corto que llegó en el form.
    // Si las partes armaron otro, hay que dejarlos iguales a la ficha.
    if (nombre !== data.nombre) {
      await Promise.all([
        admin.from('perfiles').update({ nombre }).eq('id', user.id),
        admin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, nombre },
        }),
      ])
    }
  }

  if (perfil.rol === 'profesor') {
    if (!perfil.email) return { error: 'El perfil del profesor no tiene correo asociado' }
    const { error } = await admin.from('profesores').update({
      nombre: data.nombre, email, especialidad: data.especialidad || null,
    }).eq('club_id', perfil.club_id).eq('email', perfil.email)
    if (error) {
      await restaurarPerfilYAcceso()
      return { error: 'No se pudieron actualizar los datos del profesor; se restauraron los datos anteriores' }
    }
  }

  // El reporte y el lookup por RUT leen `credencial_visible`, no `perfiles`.
  // Sin esto, cambiar el correo en Configuración deja un usuario viejo en el PDF.
  await sincronizarEmailAuth(admin, user.id, email, {
    email,
    telefono: data.telefono || null,
    rut: data.rut || null,
  })

  return { success: true }
}
