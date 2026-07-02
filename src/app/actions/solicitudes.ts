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

  // Traer la solicitud para recuperar la contraseña que eligió el jugador
  const { data: sol } = await supabase
    .from('solicitudes_jugador')
    .select('password')
    .eq('id', solicitudId)
    .eq('club_id', clubId)
    .single()

  const { data: nuevoJugador, error: insertErr } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre, rut: rut || null, email: email || null, telefono: telefono || null,
    ...planFields, elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select('id').single()
  if (insertErr || !nuevoJugador) return { error: 'Error al crear jugador: ' + (insertErr?.message ?? '') }

  await supabase.from('solicitudes_jugador').update({ estado: 'aprobado' }).eq('id', solicitudId)

  const jugador = { nombre, email: email || null, telefono: telefono || null }

  // Sin email no hay forma de crear una cuenta de acceso
  if (!email) {
    return { success: true, cuentaError: 'La solicitud no tiene email; el jugador quedó creado pero sin acceso.', jugador }
  }

  // Crear la cuenta de login con la contraseña que el jugador eligió al registrarse
  let passwordPropia = false
  let password = generarPassword()
  if (sol?.password) {
    try { password = decrypt(sol.password); passwordPropia = true } catch { passwordPropia = false }
  }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })

  let userId = creado?.user?.id
  if (createError || !userId) {
    // Si el email ya existía, buscar la cuenta y vincularla (conserva su contraseña previa)
    if (!createError?.message?.toLowerCase().includes('already')) {
      return { success: true, cuentaError: 'Jugador creado, pero no se pudo crear su cuenta: ' + (createError?.message ?? ''), jugador }
    }
    let page = 1
    while (!userId) {
      const { data: lista } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (!lista?.users.length) break
      userId = lista.users.find(u => u.email === email)?.id
      page++
    }
    if (!userId) return { success: true, cuentaError: 'El email ya está registrado pero no se pudo vincular la cuenta.', jugador }
    passwordPropia = true
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre, email, rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) return { success: true, cuentaError: 'Cuenta creada pero falló el perfil: ' + perfilError.message, jugador }

  // Ya no se necesita la contraseña guardada
  await supabase.from('solicitudes_jugador').update({ password: null }).eq('id', solicitudId)

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
