'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { asignarBloquesJugador } from '@/app/actions/horario'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAdminClub, requirePerfil } from '@/lib/auth/require'
import { authEmailDe as emailParaAuth, generarEmailInicial, generarPasswordInicial, usuarioLoginDe } from '@/lib/domain/credenciales'
import { sincronizarEmailAuth } from '@/lib/credencialesAuth'
import { BUCKET_PRIVADO, rutaFotoJugador, rutaDocumentoJugador } from '@/lib/supabase/privado'

type PlanFields = {
  categoria: string
  tipo_plan: string
  entrenamientos_por_semana: number | null
  /** null cuando todavía nadie le asignó cuota. Nunca un monto de relleno. */
  mensualidad: number | null
  /**
   * Se sigue guardando, pero NINGUNA pantalla lo muestra: era
   * `entrenamientos_por_semana × 4`, un campo que se escribe a mano al dar de
   * alta y que inscribir en un bloque no actualiza, así que un jugador de cinco
   * días semanales aparecía con doce sesiones. Lo que se muestra sale de
   * `sesionesDelMes()`, derivado de los bloques. Lo mismo vale para
   * `sesiones_usadas`, que arrastraba el total del mes anterior.
   */
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
  talla_polera?: string | null
  talla_short?: string | null
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
  const emailNormalizado = email.trim().toLowerCase() || null
  const authEmail = emailParaAuth({ email: emailNormalizado, telefono, rut })
  if (!authEmail) return { error: 'Falta email, celular (9 dígitos) o RUT para poder darle acceso' }

  const { data: nuevoJugador, error } = await supabase.from('jugadores').insert({
    club_id: clubId, nombre: nombre.trim(), rut: rut || null, email: emailNormalizado, telefono: telefono || null,
    ...planFields, sesiones_usadas: 0, estado: 'activo', es_externo: false,
  }).select().single()
  if (error || !nuevoJugador) return { error: 'Error al crear: ' + error?.message }

  // Contraseña generada por el sistema; queda espejada en `credencial_visible`
  // y el admin se la entrega al jugador desde el reporte del dashboard. Antes
  // se mandaba invitación por email, que dejaba al jugador sin acceso cuando
  // no tenía correo real (caso familiar con celular compartido).
  const password = generarPasswordInicial(nombre)

  const admin = createAdminClient()
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { nombre: nombre.trim() },
  })
  if (createError || !creado?.user) {
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese usuario ya tiene una cuenta'
      : 'No se pudo crear la cuenta de acceso' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: creado.user.id, club_id: clubId, nombre: nombre.trim(), email: authEmail,
    rol: 'jugador', jugador_id: nuevoJugador.id,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(creado.user.id)
    await supabase.from('jugadores').delete().eq('id', nuevoJugador.id)
    return { error: 'No se pudo vincular la cuenta del jugador' }
  }

  const { login, tipo } = usuarioLoginDe({ email: emailNormalizado, telefono, rut })
  await admin.from('credencial_visible').upsert({
    usuario_id: creado.user.id, club_id: clubId, password_plano: password,
    usuario_login: login, tipo_login: tipo,
  })

  // Al final: si esto falla el jugador ya existe y se arregla desde su ficha,
  // mientras que deshacer la cuenta recién creada no.
  if (bloqueIds?.length) {
    await asignarBloquesJugador({ jugadorId: nuevoJugador.id, bloqueIds })
  }

  return { success: true, password }
}

export async function crearAccesoJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: jugador } = await supabase.from('jugadores').select('id,email,nombre,telefono,rut').eq('id', params.jugadorId).eq('club_id', clubId).single()
  if (!jugador) return { error: 'Jugador no encontrado' }

  const admin = createAdminClient()
  const { data: existente } = await admin.from('perfiles').select('id').eq('jugador_id', params.jugadorId).maybeSingle()
  if (existente) return { error: 'Este jugador ya tiene una cuenta de acceso' }

  // Al que no tiene correo se le arma uno del club: `emunozh@cmsports.cl`, el
  // mismo patrón del reset masivo y de todas las cuentas que ya existen.
  //
  // ANTES CAÍA EN UN EMAIL SINTÉTICO del celular o del RUT
  // (`215892905@rut.cmsports.cl`). Funcionaba para entrar, pero dejaba una
  // cuenta que no se parece a ninguna otra, que el admin no puede dictar por
  // teléfono, y cuyo "usuario" el informe de credenciales mostraba distinto de
  // lo que auth guardaba. El caso Edison: se le entregó "+56937073626" y su
  // cuenta era el RUT.
  //
  // El correo generado se guarda TAMBIÉN en la ficha del jugador. Es lo que
  // mantiene alineados auth, el informe y la pantalla de login: a partir de ahí
  // `usuarioLoginDe` lo devuelve como email y todos miran el mismo dato.
  let emailFicha = jugador.email?.trim() ?? ''
  if (!emailFicha.includes('@')) {
    const base = generarEmailInicial(jugador.nombre)
    const [usuario, dominio] = base.split('@')
    // Los duplicados se resuelven acá, que es donde se sabe qué está ocupado.
    // Dos "Muñoz Hernández" en el mismo club no pueden compartir cuenta.
    let candidato = base
    for (let n = 2; n < 100; n++) {
      const { data: ocupado } = await admin.from('perfiles').select('id').ilike('email', candidato).maybeSingle()
      if (!ocupado) break
      candidato = `${usuario}${n}@${dominio}`
    }
    emailFicha = candidato
    await admin.from('jugadores').update({ email: emailFicha }).eq('id', params.jugadorId).eq('club_id', clubId)
  }

  const authEmail = emailParaAuth({ email: emailFicha, telefono: jugador.telefono, rut: jugador.rut })
  if (!authEmail) return { error: 'El jugador necesita email, celular (9 dígitos) o RUT para tener acceso' }

  const password = generarPasswordInicial(jugador.nombre)
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: authEmail, password, email_confirm: true, user_metadata: { nombre: jugador.nombre },
  })
  const userId = creado?.user?.id
  if (createError || !userId) {
    return { error: createError?.message?.toLowerCase().includes('already')
      ? 'Ese usuario ya tiene una cuenta. Usa recuperación de contraseña o soporte.'
      : 'No se pudo crear la cuenta: ' + (createError?.message || 'error desconocido') }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: userId, club_id: clubId, nombre: jugador.nombre, email: authEmail,
    rol: 'jugador', jugador_id: params.jugadorId,
  })
  if (perfilError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: 'No se pudo vincular la cuenta: ' + perfilError.message }
  }

  // `emailFicha` y no `jugador.email`: el segundo es el valor de ANTES de
  // generar el correo, así que el informe mostraba el celular mientras la
  // cuenta se creaba con otra cosa. Era exactamente el desalineo del caso Edison.
  const { login, tipo } = usuarioLoginDe({ email: emailFicha, telefono: jugador.telefono, rut: jugador.rut })
  await admin.from('credencial_visible').upsert({
    usuario_id: userId, club_id: clubId, password_plano: password,
    usuario_login: login, tipo_login: tipo,
  })

  // Se devuelve también el usuario. La pantalla no puede derivarlo sola: su
  // copia del jugador todavía tiene el email de antes —vacío, si se acaba de
  // generar— y mostraría el celular o el RUT en vez de la cuenta real.
  return { success: true, password, usuario: login }
}

export async function editarJugador(params: {
  jugadorId: string; nombre: string; rut: string; email: string; telefono: string
} & PlanFields & DatosExtendidos) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { jugadorId, nombre, rut, email, telefono, ...planFields } = params
  // `.select().maybeSingle()` en vez de solo `.eq('id', jugadorId)`: sin el
  // select, un jugadorId de OTRO club hace que la política de RLS filtre la
  // fila y el update no toque nada, pero devuelve éxito igual (0 filas
  // afectadas no es un error para Postgres). El código seguía de largo con
  // `admin` —que se salta RLS— y sincronizaba el email de auth de un jugador
  // ajeno con lo que el llamante hubiera mandado: un admin de un club podía
  // secuestrar el login de un jugador de otro club pasando su id a mano.
  const { data: actualizado, error } = await supabase.from('jugadores').update({
    nombre: nombre.trim(), rut: rut || null, email: email || null, telefono: telefono || null, ...planFields,
  }).eq('id', jugadorId).eq('club_id', clubId).select('id').maybeSingle()
  if (error) return { error: 'Error al editar: ' + error.message }
  if (!actualizado) return { error: 'Jugador no encontrado' }

  // Si el jugador tiene cuenta de acceso, su email/celular/rut nuevo tiene que
  // quedar reflejado en auth.users; si no, queda logueando con el dato viejo
  // aunque la ficha y el reporte de credenciales ya muestren el nuevo.
  const admin = createAdminClient()
  const { data: perfil } = await admin.from('perfiles').select('id,email').eq('jugador_id', jugadorId).eq('club_id', clubId).maybeSingle()
  if (perfil) await sincronizarEmailAuth(admin, perfil.id, perfil.email, { email, telefono, rut })

  return { success: true }
}

/**
 * Marca la matrícula como pagada y, si hubo monto, la registra en Finanzas.
 *
 * Las dos cosas van juntas en un RPC porque tienen que pasar o no pasar a la
 * vez: si el flag se guardara acá y el movimiento fallara después, quedaría un
 * jugador "al día" con plata que el club recibió y no figura en ningún lado.
 *
 * Monto 0 es válido y significa que se le eximió la matrícula: queda marcada y
 * Finanzas no se toca, porque no hubo ingreso que registrar.
 */
export async function registrarMatricula(params: {
  jugadorId: string
  monto: number
  idempotencyKey?: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }
  if (!Number.isFinite(params.monto) || params.monto < 0) return { error: 'El monto no puede ser negativo' }

  const { error } = await supabase.rpc('registrar_pago_matricula_atomico', {
    p_jugador_id: params.jugadorId,
    p_monto: Math.round(params.monto),
    p_idempotency_key: params.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error) return { error: error.message }
  return { success: true }
}

/**
 * Desmarca la matrícula, sin tocar Finanzas.
 *
 * El ingreso que se haya registrado antes se queda donde está: esa plata entró
 * de verdad y un mes ya cerrado no cambia de saldo porque después alguien
 * corrija el estado de la ficha. Desmarcar significa "de acá en adelante
 * figura como no pagada", no "nunca pagó".
 */
export async function desmarcarMatricula(params: { jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data, error } = await supabase.from('jugadores')
    .update({ matricula_pagada: false })
    .eq('id', params.jugadorId).eq('club_id', clubId)
    .select('id').maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Jugador no encontrado' }
  return { success: true }
}

// Las dos de acá abajo filtran por club igual que sus vecinas. Hoy la RLS ya
// lo impide —`jugadores_admin_write` exige club propio y rol admin—, así que
// esto no tapa un agujero abierto: evita el de mañana. Es la misma forma del
// bug de `editarJugador` (commit 8bf7a27), y el día que una de estas pase al
// cliente de servicio para resolver otra cosa, se abre sola y sin ruido.

export async function actualizarMensualidad(params: { jugadorId: string; mensualidad: number }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }
  const { data, error } = await supabase.from('jugadores')
    .update({ mensualidad: params.mensualidad })
    .eq('id', params.jugadorId).eq('club_id', clubId)
    .select('id').maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Jugador no encontrado' }
  return { success: true }
}

export async function toggleEstadoJugador(params: { jugadorId: string; nuevoEstado: 'activo' | 'bloqueado' }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data, error } = await supabase.from('jugadores')
    .update({ estado: params.nuevoEstado })
    .eq('id', params.jugadorId).eq('club_id', clubId)
    .select('id').maybeSingle()
  if (error) return { error: 'Error al cambiar estado' }
  if (!data) return { error: 'Jugador no encontrado' }
  return { success: true }
}

export async function eliminarJugador(params: { jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: jugador } = await supabase.from('jugadores')
    .select('id').eq('id', params.jugadorId).eq('club_id', clubId).maybeSingle()
  if (!jugador) return { error: 'Jugador no encontrado' }

  const admin = createAdminClient()

  // Perfil y documentos ANTES de borrar: después ya no hay de dónde sacar
  // el user_id de Auth ni las rutas de archivos que hay que limpiar del bucket.
  const { data: perfilJugador } = await admin.from('perfiles')
    .select('id').eq('jugador_id', params.jugadorId).maybeSingle()
  const { data: documentos } = await admin.from('jugador_documentos')
    .select('archivo_path').eq('jugador_id', params.jugadorId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('eliminar_jugador_atomico', { p_jugador_id: params.jugadorId })
  if (error) {
    console.error('eliminarJugador RPC falló', params.jugadorId, error)
    return { error: 'Error al eliminar jugador: ' + error.message }
  }

  // Si tenía cuenta de acceso, borrarla de Auth para no dejar fantasmas
  // (credencial_visible cae sola por ON DELETE CASCADE hacia auth.users)
  if (perfilJugador?.id) await admin.auth.admin.deleteUser(perfilJugador.id)

  const rutasStorage = (documentos ?? []).map(d => d.archivo_path).filter(Boolean) as string[]
  rutasStorage.push(rutaFotoJugador(clubId!, params.jugadorId))
  await admin.storage.from(BUCKET_PRIVADO).remove(rutasStorage)
  await admin.storage.from('galeria-fotos').remove([`avatares/${params.jugadorId}.jpg`])

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
  const { data: perfilData } = await admin.from('perfiles').select('id,email').eq('jugador_id', params.jugadorId).eq('club_id', clubId).maybeSingle()
  if (!perfilData) return { error: 'Este jugador no tiene cuenta de acceso' }

  const { error } = await admin.auth.admin.updateUserById(perfilData.id, { password: params.nuevaPassword })
  if (error) return { error: 'No se pudo cambiar la contraseña: ' + error.message }

  // Espejar en el reporte: si no, quedaba viendo la clave vieja hasta el
  // próximo reset masivo o hasta que alguien la volviera a cambiar. El admin
  // acaba de tipearla, saberla es el motivo del reporte.
  const { data: jug } = await admin.from('jugadores').select('email,telefono,rut').eq('id', params.jugadorId).single()
  // Mismo motivo que en editarJugador: si el dato del jugador cambió después
  // de creada la cuenta, auth.users se queda con el email viejo y la clave
  // nueva no sirve de nada porque el login se intenta con el email actual.
  await sincronizarEmailAuth(admin, perfilData.id, perfilData.email, { email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
  const { login, tipo } = usuarioLoginDe({ email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
  await admin.from('credencial_visible').upsert({
    usuario_id: perfilData.id, club_id: clubId, password_plano: params.nuevaPassword,
    usuario_login: login, tipo_login: tipo,
  })

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
