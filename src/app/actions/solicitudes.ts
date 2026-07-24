'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'

export async function aprobarSolicitud(params: {
  solicitudId: string
  nombre: string
  rut: string
  email: string
  telefono: string
  fecha_nacimiento: string
  direccion: string
  comuna: string
  contacto_emergencia_nombre: string
  contacto_emergencia_telefono: string
  indicaciones_medicas: string
  password: string
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const {
    solicitudId, nombre, rut, email, telefono,
    fecha_nacimiento, direccion, comuna,
    contacto_emergencia_nombre, contacto_emergencia_telefono, indicaciones_medicas,
    password,
    ...planFields
  } = params
  const emailNormalizado = email.trim().toLowerCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sol } = await (supabase as any)
    .from('solicitudes_jugador')
    .select('id,estado')
    .eq('id', solicitudId)
    .eq('club_id', clubId)
    .single()

  if (!sol || sol.estado !== 'pendiente') return { error: 'La solicitud ya no está pendiente' }
  if (!emailNormalizado) return { error: 'La solicitud no tiene un correo válido' }
  if (!password || password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  const { data: nuevoJugador, error: insertErr } = await supabase.from('jugadores').insert({
    club_id: clubId,
    nombre: nombre.trim(),
    rut: rut || null,
    email: emailNormalizado,
    telefono: telefono || null,
    fecha_nacimiento: fecha_nacimiento || null,
    direccion: direccion || null,
    comuna: comuna || null,
    contacto_emergencia_nombre: contacto_emergencia_nombre || null,
    contacto_emergencia_telefono: contacto_emergencia_telefono || null,
    indicaciones_medicas: indicaciones_medicas || null,
    ...planFields,
    sesiones_usadas: 0,
    estado: 'activo',
    es_externo: false,
  }).select('id').single()
  if (insertErr || !nuevoJugador) return { error: 'Error al crear jugador: ' + (insertErr?.message ?? '') }

  const jugador = { nombre: nombre.trim(), email: emailNormalizado, telefono: telefono || null }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    password,
    email_confirm: true,
    user_metadata: { nombre: nombre.trim() },
  })

  const userId = creado?.user?.id
  if (createError || !userId) {
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese correo ya tiene una cuenta. Usa otro correo.'
      : 'No se pudo crear la cuenta de acceso del jugador.' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre: nombre.trim(), email: emailNormalizado, rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(userId)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo vincular el perfil de acceso del jugador.' }
  }

  const { error: aprobarError } = await supabase.from('solicitudes_jugador')
    .update({ estado: 'aprobado' }).eq('id', solicitudId).eq('club_id', clubId)
  if (aprobarError) {
    await admin.auth.admin.deleteUser(userId)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo finalizar la aprobación. Intenta nuevamente.' }
  }

  return {
    success: true,
    cuentaCreada: true,
    jugador,
  }
}

export async function rechazarSolicitud(params: { solicitudId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('solicitudes_jugador').update({ estado: 'rechazado' }).eq('id', params.solicitudId)
  if (error) return { error: 'Error al rechazar' }
  return { success: true }
}
