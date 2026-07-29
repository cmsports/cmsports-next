'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { asignarBloquesJugador } from '@/app/actions/horario'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAdminClub, requirePerfil } from '@/lib/auth/require'
import { getInviteRedirectUrl } from '@/lib/auth/invite-url'
import { BUCKET_PRIVADO, rutaFotoJugador, rutaDocumentoJugador } from '@/lib/supabase/privado'

type PlanFields = {
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  /** null cuando todavía nadie le asignó cuota. Nunca un monto de relleno. */
  mensualidad: number | null
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
  // Un jugador pertenece a su categoría por edad y además a TC (todo competidor).
  categorias?: string[] | null
  nombres?: string | null
  apellido1?: string | null
  apellido2?: string | null
  apellido3?: string | null
}

export async function crearJugador(params: {
  nombre: string; rut: string; email: string; telefono: string
  /** Grupos del horario a los que entra. Sin esto queda sin días ni sede, no
   *  aparece en la lista de asistencia y no puede marcarse solo desde la app. */
  bloqueIds?: string[]
} & PlanFields & DatosExtendidos) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { nombre, rut, email, telefono, bloqueIds, ...planFields } = params
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

  // Al final: si esto falla el jugador ya existe y se arregla desde su ficha,
  // mientras que deshacer la cuenta recién creada no.
  if (bloqueIds?.length) {
    await asignarBloquesJugador({ jugadorId: nuevoJugador.id, bloqueIds })
  }

  return { success: true, invitacionEnviada: true }
}

export async function crearAccesoJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: jugador } = await supabase.from('jugadores').select('id,email,nombre').eq('id', params.jugadorId).eq('club_id', clubId).single()
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

export async function actualizarMensualidad(params: { jugadorId: string; mensualidad: number }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }
  const { error } = await supabase.from('jugadores').update({ mensualidad: params.mensualidad }).eq('id', params.jugadorId)
  if (error) return { error: error.message }
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

export async function subirFotoJugador(params: { jugadorId: string; base64: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: jug } = await supabase.from('jugadores').select('id').eq('id', params.jugadorId).eq('club_id', clubId).single()
  if (!jug) return { error: 'Jugador no encontrado' }

  const buffer = Buffer.from(params.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  const path = rutaFotoJugador(clubId!, params.jugadorId)
  const admin = createAdminClient()

  const { error: upErr } = await admin.storage.from(BUCKET_PRIVADO)
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })
  if (upErr) return { error: 'Error al subir imagen: ' + upErr.message }

  // Se limpia foto_url: la foto vieja vivía en el bucket público y su enlace
  // seguiría funcionando para cualquiera que lo tuviera guardado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('jugadores')
    .update({ foto_path: path, foto_url: null })
    .eq('id', params.jugadorId)

  await admin.storage.from('galeria-fotos').remove([`avatares/${params.jugadorId}.jpg`])

  const { data: firmada } = await admin.storage.from(BUCKET_PRIVADO).createSignedUrl(path, 3600)
  return { success: true, url: firmada?.signedUrl ?? null, path }
}

const TIPOS_DOC = ['derecho_formacion', 'carta_compromiso'] as const
export type TipoDocumento = typeof TIPOS_DOC[number]

// Solo PDF. Antes se aceptaba también Word y foto; el criterio quedó en un
// solo formato que se archiva y se timbra igual sin depender de qué programa
// tenga cada uno instalado.
const EXT_DOC: Record<string, string> = {
  'application/pdf': 'pdf',
}

// El jugador puede subir sus propios documentos; el staff, los de cualquiera.
async function requireAccesoJugador(jugadorId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, clubId: null, nombre: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,nombre,jugador_id').eq('id', user.id).single()
  if (!perfil?.club_id) return { error: 'Acceso denegado' as const, clubId: null, nombre: null }

  const esStaff = ['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')
  if (!esStaff && perfil.jugador_id !== jugadorId) return { error: 'Acceso denegado' as const, clubId: null, nombre: null }

  const admin = createAdminClient()
  const { data: jug } = await admin.from('jugadores').select('id').eq('id', jugadorId).eq('club_id', perfil.club_id).maybeSingle()
  if (!jug) return { error: 'Jugador no encontrado' as const, clubId: null, nombre: null }

  return { error: null, clubId: perfil.club_id, nombre: perfil.nombre ?? null }
}

export async function subirDocumentoJugador(params: {
  jugadorId: string
  tipo: TipoDocumento
  base64: string
  nombreArchivo: string
}) {
  if (!TIPOS_DOC.includes(params.tipo)) return { error: 'Tipo de documento inválido' }
  const { error: authErr, clubId, nombre } = await requireAccesoJugador(params.jugadorId)
  if (authErr || !clubId) return { error: authErr || 'Acceso denegado' }

  const mime = params.base64.match(/^data:([^;]+);base64,/)?.[1] || ''
  const ext = EXT_DOC[mime]
  if (!ext) return { error: 'Formato inválido. Solo se aceptan archivos PDF.' }

  const buffer = Buffer.from(params.base64.replace(/^data:[^;]+;base64,/, ''), 'base64')
  if (buffer.byteLength > 10 * 1024 * 1024) return { error: 'El archivo supera los 10 MB' }

  const admin = createAdminClient()
  const path = rutaDocumentoJugador(clubId, params.jugadorId, params.tipo, ext)

  // Se borra la versión anterior: puede tener otra extensión y quedaría huérfana.
  const { data: previo } = await admin.from('jugador_documentos')
    .select('archivo_path').eq('jugador_id', params.jugadorId).eq('tipo', params.tipo).maybeSingle()
  if (previo?.archivo_path && previo.archivo_path !== path) {
    await admin.storage.from(BUCKET_PRIVADO).remove([previo.archivo_path])
  }

  const { error: upErr } = await admin.storage.from(BUCKET_PRIVADO)
    .upload(path, buffer, { contentType: mime, upsert: true })
  if (upErr) return { error: 'Error al subir el archivo: ' + upErr.message }

  const { error: dbErr } = await admin.from('jugador_documentos').upsert({
    club_id: clubId,
    jugador_id: params.jugadorId,
    tipo: params.tipo,
    archivo_path: path,
    archivo_url: '',   // columna heredada del bucket público, ya no se usa
    nombre_archivo: params.nombreArchivo.slice(0, 200),
    subido_por: nombre,
  }, { onConflict: 'jugador_id,tipo' })
  if (dbErr) return { error: 'Error al registrar el documento: ' + dbErr.message }

  const { data: firmada } = await admin.storage.from(BUCKET_PRIVADO).createSignedUrl(path, 3600)
  return { success: true, url: firmada?.signedUrl ?? null, path, nombreArchivo: params.nombreArchivo }
}

export async function eliminarDocumentoJugador(params: { jugadorId: string; tipo: TipoDocumento }) {
  const { error: authErr, clubId } = await requireAccesoJugador(params.jugadorId)
  if (authErr || !clubId) return { error: authErr || 'Acceso denegado' }

  const admin = createAdminClient()
  const { data: doc } = await admin.from('jugador_documentos')
    .select('archivo_path').eq('jugador_id', params.jugadorId).eq('tipo', params.tipo).maybeSingle()

  if (doc?.archivo_path) await admin.storage.from(BUCKET_PRIVADO).remove([doc.archivo_path])
  await admin.from('jugador_documentos').delete().eq('jugador_id', params.jugadorId).eq('tipo', params.tipo)
  return { success: true }
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

/**
 * Mueve un jugador a otro club junto con su asistencia, mensualidades y clases
 * extras. Antes cambiar jugadores.club_id a mano dejaba las filas viejas
 * apuntando al club anterior; esto las mueve todas juntas.
 *
 * bloque_jugadores no se traslada: los bloques pertenecen al club anterior y
 * no existen en el nuevo. El admin del club receptor lo inscribe en los suyos.
 */
export async function traspasarJugador(input: { jugadorId: string; clubIdNuevo: string }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin, el profesor o el superadmin pueden traspasar un jugador' }
  }
  if (!input.jugadorId || !input.clubIdNuevo) return { error: 'Falta el jugador o el club de destino' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('traspasar_jugador', {
    p_jugador_id: input.jugadorId,
    p_club_id_nuevo: input.clubIdNuevo,
  })
  if (error) return { error: error.message }
  return { ok: true }
}
