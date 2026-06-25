'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONFIG } from '@/lib/config'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

export async function obtenerLinkInvitacion() {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr }

  let { data: inv } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
  if (!inv?.length) {
    await supabase.from('invitaciones').insert({ club_id: clubId })
    const { data: newInv } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
    inv = newInv
  }
  return { codigo: inv?.[0]?.codigo || '', clubId }
}

export async function aprobarSolicitud(input: {
  solicitudId: string
  clubId: string
  categoria: string
  tipoPlan: string
  entrenamientosPorSemana: number | null
  mensualidad: number
  sesionesLimite: number
  origin: string
}) {
  const supabase = await createClient()

  const { data: sol } = await supabase
    .from('solicitudes_jugador')
    .select('*')
    .eq('id', input.solicitudId)
    .eq('club_id', input.clubId)
    .eq('estado', 'pendiente')
    .single()

  if (!sol) {
    return { error: 'Solicitud no encontrada o ya procesada' }
  }
  if (!sol.email) {
    return { error: 'La solicitud no tiene email — no se puede invitar al jugador' }
  }

  const { data: nuevoJugador, error: insertError } = await supabase
    .from('jugadores')
    .insert({
      club_id: input.clubId,
      nombre: sol.nombre,
      rut: sol.rut,
      email: sol.email,
      telefono: sol.telefono,
      categoria: input.categoria,
      tipo_plan: input.tipoPlan,
      entrenamientos_por_semana: input.entrenamientosPorSemana,
      mensualidad: input.mensualidad,
      sesiones_limite: input.sesionesLimite,
      elo: CONFIG.ELO_INICIAL,
      sesiones_usadas: 0,
      estado: 'activo',
      es_externo: false,
    })
    .select()
    .single()

  if (insertError || !nuevoJugador) {
    return { error: 'Error al crear jugador' }
  }

  const { error: updateError } = await supabase
    .from('solicitudes_jugador')
    .update({ estado: 'aprobado' })
    .eq('id', input.solicitudId)

  if (updateError) {
    return { error: 'Error al actualizar solicitud' }
  }

  const passwordPropia = !!sol.password
  const password = sol.password || generarPassword()

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: sol.email,
    password,
    email_confirm: true,
  })

  if (createError || !creado?.user) {
    return { success: true, inviteError: createError?.message || 'No se pudo crear la cuenta del jugador' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: creado.user.id,
    club_id: input.clubId,
    nombre: sol.nombre,
    email: sol.email,
    rol: 'jugador',
    jugador_id: nuevoJugador.id,
  })

  if (perfilError) {
    return { success: true, inviteError: 'Cuenta creada pero falló crear el perfil: ' + perfilError.message }
  }

  await supabase.from('solicitudes_jugador').update({ password: null }).eq('id', input.solicitudId)

  return { success: true, password: passwordPropia ? undefined : password }
}

function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

export async function rechazarSolicitud(solicitudId: string, clubId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('solicitudes_jugador')
    .update({ estado: 'rechazado' })
    .eq('id', solicitudId)
    .eq('club_id', clubId)

  if (error) {
    return { error: 'Error al rechazar solicitud' }
  }

  return { success: true }
}
