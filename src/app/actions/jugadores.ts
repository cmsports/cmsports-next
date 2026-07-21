'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAdminClub } from '@/lib/auth/require'
import { getInviteRedirectUrl } from '@/lib/auth/invite-url'

type PlanFields = {
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  mensualidad: number
  sesiones_limite: number
}

type DatosExtendidos = {
  fecha_nacimiento?: string | null
  comuna?: string | null
  direccion?: string | null
  contacto_emergencia_nombre?: string | null
  contacto_emergencia_telefono?: string | null
  indicaciones_medicas?: string | null
  federado?: boolean | null
}

export async function crearJugador(params: {
  nombre: string; rut: string; email: string; telefono: string
} & PlanFields & DatosExtendidos) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { nombre, rut, email, telefono, ...planFields } = params
  const emailNormalizado = email.trim().toLowerCase()
  if (!emailNormalizado) return { error: 'El email es obligatorio' }
  let redirectTo: string
  try { redirectTo = getInviteRedirectUrl() } catch {
    return { error: 'Falta configurar NEXT_PUBLIC_APP_URL para enviar invitaciones.' }
  }

  const { data: nuevoJugador, error } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre: nombre.trim(), rut: rut || null, email: emailNormalizado, telefono: telefono || null,
    ...planFields, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select().single()
  if (error || !nuevoJugador) return { error: 'Error al crear: ' + error?.message }

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.inviteUserByEmail(emailNormalizado, {
    redirectTo,
    data: { nombre: nombre.trim() },
  })
  if (createError || !creado?.user) {
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese email ya tiene una cuenta'
      : 'No se pudo crear la cuenta de acceso' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: creado.user.id, club_id: clubId, nombre: nombre.trim(), email: emailNormalizado,
    rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(creado.user.id)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo vincular la cuenta del jugador' }
  }

  return { success: true, invitacionEnviada: true }
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

  let redirectTo: string
  try { redirectTo = getInviteRedirectUrl() } catch {
    return { error: 'Falta configurar NEXT_PUBLIC_APP_URL para enviar invitaciones.' }
  }

  const { data: creado, error: createError } = await admin.auth.admin.inviteUserByEmail(jugador.email, {
    redirectTo,
    data: { nombre: jugador.nombre },
  })

  const userId = creado?.user?.id
  if (createError || !userId) {
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese email ya tiene una cuenta. Usa recuperación de contraseña o soporte.'
      : 'No se pudo enviar la invitación: ' + (createError?.message || 'error desconocido') }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre: jugador.nombre, email: jugador.email,
    rol: 'jugador', jugador_id: params.jugadorId,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: 'No se pudo vincular la cuenta: ' + perfilError.message }
  }

  return { success: true, invitacionEnviada: true }
}

export async function editarJugador(params: {
  jugadorId: string; nombre: string; rut: string; email: string; telefono: string
} & PlanFields & DatosExtendidos) {
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

  const admin = createAdminClient()

  // Buscar el perfil ANTES de borrar para obtener el user_id de Auth
  const { data: perfilJugador } = await admin.from('perfiles')
    .select('id')
    .eq('jugador_id', params.jugadorId)
    .maybeSingle()

  const { error } = await supabase.from('jugadores').delete().eq('id', params.jugadorId)
  if (error) return { error: 'Error al eliminar jugador' }

  // Si tenía cuenta de acceso, limpiar perfil y usuario de Auth para no dejar fantasmas
  if (perfilJugador?.id) {
    await admin.from('perfiles').delete().eq('id', perfilJugador.id)
    await admin.auth.admin.deleteUser(perfilJugador.id)
  }

  return { success: true }
}

export async function verificarBloqueoPerfil(): Promise<boolean> {
  try {
    const supabase = await createServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('jugador_id,rol,club_id')
      .eq('id', session.user.id)
      .single()

    if (perfil?.rol !== 'jugador') return false

    const admin = createAdminClient()

    if (perfil?.jugador_id) {
      const { data: jug } = await admin
        .from('jugadores').select('estado').eq('id', perfil.jugador_id).single()
      return jug?.estado === 'bloqueado'
    }

    // jugador_id no vinculado: buscar por email del usuario autenticado
    if (session.user.email && perfil?.club_id) {
      const { data: jug } = await admin
        .from('jugadores').select('estado')
        .eq('club_id', perfil.club_id).ilike('email', session.user.email).maybeSingle()
      return jug?.estado === 'bloqueado'
    }

    return false
  } catch {
    return false
  }
}

export async function resetearPasswordJugador(params: { jugadorId: string; nuevaPassword: string }) {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr || 'No autorizado' }
  if (params.nuevaPassword.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  const admin = createAdminClient()
  const { data: perfilData } = await admin.from('perfiles').select('id').eq('jugador_id', params.jugadorId).eq('club_id', clubId).maybeSingle()
  if (!perfilData) return { error: 'Este jugador no tiene cuenta de acceso' }

  const { error } = await admin.auth.admin.updateUserById(perfilData.id, { password: params.nuevaPassword })
  if (error) return { error: 'No se pudo cambiar la contraseña: ' + error.message }
  return { success: true }
}
