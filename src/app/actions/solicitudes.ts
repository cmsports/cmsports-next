'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt, generarPassword } from '@/lib/crypto'

export async function aprobarSolicitud(params: {
  solicitudId: string
  nombre: string
  rut: string
  email: string
  telefono: string
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { solicitudId, nombre, rut, email, telefono, ...planFields } = params
  const emailNormalizado = email.trim().toLowerCase()

  // Traer la solicitud para recuperar la contraseña que eligió el jugador
  const { data: sol } = await supabase
    .from('solicitudes_jugador')
    .select('password')
    .eq('id', solicitudId)
    .eq('club_id', clubId)
    .single()

  if (!emailNormalizado) return { error: 'La solicitud no tiene un correo válido' }

  let passwordPropia = false
  let password = generarPassword()
  if (sol?.password) {
    try { password = decrypt(sol.password); passwordPropia = true } catch {
      return { error: 'No se pudo recuperar la contraseña elegida. Pide al jugador enviar nuevamente la solicitud.' }
    }
  }

  const { data: nuevoJugador, error: insertErr } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre, rut: rut || null, email: emailNormalizado, telefono: telefono || null,
    ...planFields, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select('id').single()
  if (insertErr || !nuevoJugador) return { error: 'Error al crear jugador: ' + (insertErr?.message ?? '') }

  const jugador = { nombre, email: emailNormalizado, telefono: telefono || null }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: emailNormalizado, password, email_confirm: true,
  })

  const userId = creado?.user?.id
  if (createError || !userId) {
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese correo ya tiene una cuenta. Usa otro correo o recupera su contraseña.'
      : 'No se pudo crear la cuenta de acceso del jugador.' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre, email: emailNormalizado, rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(userId)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo vincular el perfil de acceso del jugador.' }
  }

  const { error: aprobarError } = await supabase.from('solicitudes_jugador')
    .update({ estado: 'aprobado', password: null }).eq('id', solicitudId).eq('club_id', clubId)
  if (aprobarError) {
    await admin.auth.admin.deleteUser(userId)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo finalizar la aprobación. Intenta nuevamente.' }
  }

  return {
    success: true,
    cuentaCreada: true,
    passwordPropia,
    // Solo se devuelve una contraseña si tuvimos que generarla (el jugador no eligió una)
    password: passwordPropia ? undefined : password,
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
