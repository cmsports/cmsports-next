'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

type PlanFields = {
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}

export async function crearJugador(params: {
  nombre: string; rut: string; email: string; password: string; telefono: string
} & PlanFields) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { nombre, rut, email, password, telefono, ...planFields } = params
  if (!email.trim()) return { error: 'El email es obligatorio' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  const { data: nuevoJugador, error } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre: nombre.trim(), rut: rut || null, email: email.trim(), telefono: telefono || null,
    ...planFields, elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select().single()
  if (error || !nuevoJugador) return { error: 'Error al crear: ' + error?.message }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: email.trim(), password, email_confirm: true,
  })
  if (createError || !creado?.user) {
    return { success: true, cuentaError: createError?.message || 'No se pudo crear la cuenta de acceso' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: creado.user.id, club_id: clubId, nombre: nombre.trim(), email: email.trim(),
    rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    return { success: true, cuentaError: 'Cuenta creada pero falló crear el perfil: ' + perfilError.message }
  }

  return { success: true }
}

function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

export async function crearAccesoJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: jugador } = await supabase.from('jugadores').select('*').eq('id', params.jugadorId).eq('club_id', clubId).single()
  if (!jugador) return { error: 'Jugador no encontrado' }
  if (!jugador.email) return { error: 'El jugador no tiene email registrado' }

  const admin = createAdminClient()
  const { data: existente } = await admin.from('perfiles').select('id').eq('jugador_id', params.jugadorId).maybeSingle()
  if (existente) return { error: 'Este jugador ya tiene una cuenta de acceso' }

  const { data: solicitud } = await admin.from('solicitudes_jugador')
    .select('id,password').eq('club_id', clubId).eq('email', jugador.email)
    .not('password', 'is', null).order('creado_en', { ascending: false }).limit(1).maybeSingle()

  let passwordPropia = !!solicitud?.password
  const password = solicitud?.password || generarPassword()

  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: jugador.email, password, email_confirm: true,
  })

  let userId = creado?.user?.id
  if (createError || !userId) {
    if (!createError?.message?.toLowerCase().includes('already')) {
      return { error: 'No se pudo crear la cuenta: ' + (createError?.message || 'error desconocido') }
    }
    let page = 1
    while (!userId) {
      const { data: lista } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (!lista?.users.length) break
      userId = lista.users.find(u => u.email === jugador.email)?.id
      page++
    }
    if (!userId) return { error: 'El email ya está registrado pero no se pudo encontrar la cuenta' }
    passwordPropia = true
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre: jugador.nombre, email: jugador.email,
    rol: 'jugador', jugador_id: params.jugadorId,
  })
  if (perfilError) return { error: 'Cuenta creada pero falló crear el perfil: ' + perfilError.message }

  if (solicitud) await admin.from('solicitudes_jugador').update({ password: null }).eq('id', solicitud.id)

  return { success: true, password: passwordPropia ? undefined : password }
}

export async function editarJugador(params: {
  jugadorId: string; nombre: string; rut: string; email: string; telefono: string
} & PlanFields) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { jugadorId, nombre, rut, email, telefono, ...planFields } = params
  const { error } = await supabase.from('jugadores').update({
    nombre: nombre.trim(), rut: rut || null, email: email || null, telefono: telefono || null, ...planFields,
  }).eq('id', jugadorId)
  if (error) return { error: 'Error al editar: ' + error.message }
  return { success: true }
}

export async function toggleEstadoJugador(params: { jugadorId: string; nuevoEstado: 'activo' | 'bloqueado' }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('jugadores').update({ estado: params.nuevoEstado }).eq('id', params.jugadorId)
  if (error) return { error: 'Error al cambiar estado' }
  return { success: true }
}

export async function eliminarJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('jugadores').delete().eq('id', params.jugadorId)
  if (error) return { error: 'Error al eliminar' }
  return { success: true }
}
