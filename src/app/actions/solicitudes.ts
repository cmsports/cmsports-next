'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { asignarBloquesJugador } from '@/app/actions/horario'
import { usuarioLoginDe } from '@/lib/domain/credenciales'

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
  talla_polera: string
  talla_short: string
  password: string
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  /** null cuando todavía nadie le asignó cuota. Nunca un monto de relleno. */
  mensualidad: number | null
  sesiones_limite: number
  /** Grupos del horario a los que entra. Sin esto queda sin días ni sede, no
   *  aparece en ninguna lista y no se puede marcar la asistencia solo. */
  bloqueIds: string[]
  /** Si pagó la matrícula al momento de aceptarlo. Si no, la ficha queda con
   *  la matrícula pendiente y se cobra después desde el perfil. */
  matriculaPagada?: boolean
  /** Monto cobrado. 0 = se le eximió. Solo se usa si matriculaPagada. */
  matriculaMonto?: number | null
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const {
    solicitudId, nombre, rut, email, telefono,
    fecha_nacimiento, direccion, comuna,
    contacto_emergencia_nombre, contacto_emergencia_telefono, indicaciones_medicas,
    talla_polera, talla_short,
    password, bloqueIds, matriculaPagada, matriculaMonto,
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
    talla_polera: talla_polera || null,
    talla_short: talla_short || null,
    ...planFields,
    sesiones_usadas: 0,
    estado: 'activo',
    es_externo: false,
    // A diferencia de los jugadores que ya venían (que la migración 138 dio
    // por pagada), el que entra ahora solo queda marcado si de verdad la pagó
    // en este momento. El ingreso en Finanzas se registra más abajo con el RPC.
    matricula_pagada: !!matriculaPagada,
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

  // Espejo de la contraseña recién creada, para que el admin la pueda ver en
  // el reporte del dashboard. Si falla, el alta sigue en pie: la clave la sabe
  // el jugador (la eligió él), y no tener el espejo se arregla con el botón
  // "Resetear" desde el reporte. Es peor abortar el alta por esto.
  const { login, tipo } = usuarioLoginDe({ email: emailNormalizado, telefono: telefono || null, rut: rut || null })
  await admin.from('credencial_visible').upsert({
    usuario_id: userId, club_id: clubId, password_plano: password,
    usuario_login: login, tipo_login: tipo,
  })

  // Los grupos van al final: si algo falla acá el jugador ya existe y se puede
  // arreglar desde su ficha, mientras que deshacer la cuenta creada no.
  if (bloqueIds?.length) {
    await asignarBloquesJugador({ jugadorId: nuevoJugador.id, bloqueIds })
  }

  // La matrícula, si la pagó al entrar. Va después del alta y con su propio
  // RPC porque el ingreso tiene que quedar atado al jugador ya creado. Si
  // falla, el alta no se deshace: el jugador ya está y la matrícula se cobra
  // desde su ficha, que es mucho mejor que perder la cuenta recién creada.
  if (matriculaPagada && (matriculaMonto ?? 0) > 0) {
    await supabase.rpc('registrar_pago_matricula_atomico', {
      p_jugador_id: nuevoJugador.id,
      p_monto: Math.round(matriculaMonto as number),
      p_idempotency_key: crypto.randomUUID(),
    })
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
