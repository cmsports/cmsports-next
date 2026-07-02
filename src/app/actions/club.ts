'use server'

import { requireAdminClub } from '@/lib/auth/require'

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
