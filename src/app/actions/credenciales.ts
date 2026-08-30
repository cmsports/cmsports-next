'use server'

import { requireAdminClub, requirePerfil } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { generarEmailInicial, generarPasswordInicial, usuarioLoginDe } from '@/lib/domain/credenciales'
import { sincronizarEmailAuth } from '@/lib/credencialesAuth'

export type FilaCredencial = {
  usuarioId: string
  jugadorId: string | null
  nombre: string
  rol: 'admin' | 'superadmin' | 'profesor' | 'jugador'
  usuarioLogin: string
  tipoLogin: 'email' | 'celular' | 'rut'
  passwordPlano: string | null    // null si el jugador ya la cambió y nunca se reseteó desde acá
  actualizadoEn: string | null
  telefono: string | null         // para armar el link de WhatsApp; null si no es jugador o no tiene celular cargado
}

/**
 * Todo lo que ve el admin en el reporte. Se junta acá y no en la pantalla
 * porque cruza dos fuentes: `perfiles` (todos los que pueden entrar) y
 * `credencial_visible` (los que tienen su clave espejada).
 *
 * Los perfiles sin espejo aparecen igual, con `passwordPlano: null`. El admin
 * los ve y puede resetear desde el mismo lugar. Preferí eso a esconderlos:
 * "no aparece" se confunde con "no tiene cuenta", y es peor.
 */
export async function listarCredenciales(): Promise<{ error?: string; filas?: FilaCredencial[] }> {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const [{ data: perfiles }, { data: espejos }, { data: jugadores }] = await Promise.all([
    admin.from('perfiles').select('id,nombre,email,rol,jugador_id').eq('club_id', clubId).order('rol').order('nombre'),
    admin.from('credencial_visible').select('usuario_id,password_plano,usuario_login,tipo_login,actualizado_en').eq('club_id', clubId),
    // Traemos también el nombre del jugador: la ficha suele tener el nombre
    // completo (con apellidos), mientras que `perfiles.nombre` a veces quedó
    // corto —el caso "Agustin" a secas—. Se muestra el más completo.
    admin.from('jugadores').select('id,nombre,telefono,rut').eq('club_id', clubId),
  ])

  // Se realinea el `usuario_login` de quien tenga un espejo con el correo
  // viejo. Nada más: ABRIR ESTA PANTALLA NO CAMBIA NINGUNA CONTRASEÑA.
  //
  // Antes sí lo hacía. A todo perfil sin espejo se le generaba
  // `nombreapellido123` y se le aplicaba en auth — el "alta silenciosa", para
  // que el admin nunca viera "no la tenemos". El costo era que a quien había
  // cambiado su clave por su cuenta y no tenía espejo, mirar el informe se la
  // reescribía y lo dejaba afuera. Una lectura no puede tener ese efecto.
  //
  // Hoy esos perfiles aparecen con `passwordPlano: null` y la pantalla ofrece
  // el botón "Resetear", que hace lo mismo pero de forma explícita, a pedido y
  // con un solo destinatario a la vista.
  //
  // Con espejo y login viejo: SOLO se corrige `usuario_login`. Regenerar la
  // contraseña por abrir el informe era el caso Colomba: el admin bajaba el
  // PDF y le cambiaba la clave a todo el que tenía el correo desfasado.
  //
  // No se compara para tipo celular/rut: ahí el login que se muestra es el
  // número o RUT crudo, no el email sintético que vive en `perfiles.email`
  // (`<tel>@cel.cmsports.cl`), así que comparados tal cual siempre "difieren"
  // sin que eso sea un problema.
  const espejoPorId = new Map((espejos ?? []).map((e: { usuario_id: string; usuario_login: string; tipo_login: string }) => [e.usuario_id, e]))
  const jugPorIdSync = new Map((jugadores ?? []).map((j: { id: string; telefono: string | null; rut: string | null }) => [j.id, j]))
  const desalineado = (p: { id: string; email: string | null }) => {
    const esp = espejoPorId.get(p.id)
    if (!esp) return true
    if (esp.tipo_login !== 'email' || !p.email) return false
    return esp.usuario_login.trim().toLowerCase() !== p.email.trim().toLowerCase()
  }
  // El superadmin se salta la sincronización automática. Su perfil toma el
  // `club_id` del club que esté gestionando (ver `gestionarClub`), así que cae
  // dentro de este listado como cualquier admin — pero su cuenta no pertenece
  // al club y no sigue el patrón de credenciales del club. Sin esta exclusión,
  // basta con ABRIR esta pantalla para que se le reescriba la contraseña y
  // quede fuera de la plataforma sin que nadie haya pedido un reset.
  const faltantes = (perfiles ?? []).filter(p => p.rol !== 'superadmin' && desalineado(p))
  for (const p of faltantes as { id: string; nombre: string; email: string | null; jugador_id: string | null }[]) {
    const esp = espejoPorId.get(p.id)
    // Sin espejo no se hace nada: se listará con `passwordPlano: null`.
    if (!esp) continue
    const jug = p.jugador_id ? jugPorIdSync.get(p.jugador_id) : null
    const { login, tipo } = usuarioLoginDe({ email: p.email, telefono: jug?.telefono ?? null, rut: jug?.rut ?? null })
    await admin.from('credencial_visible').update({
      usuario_login: login, tipo_login: tipo,
    }).eq('usuario_id', p.id)
    esp.usuario_login = login
    esp.tipo_login = tipo
  }
  const espejosFinal = [...(espejos ?? [])]

  // Jugadores por id para completar el login cuando el perfil no lo tiene y
  // para preferir su nombre completo sobre el que quedó en perfiles.
  const jugPorId = new Map((jugadores ?? []).map((j: { id: string; nombre: string; telefono: string | null; rut: string | null }) => [j.id, j]))
  const espejoPorUser = new Map(
    espejosFinal.map((e: { usuario_id: string; password_plano: string; usuario_login: string; tipo_login: string; actualizado_en: string }) => [e.usuario_id, e]),
  )

  const filas: FilaCredencial[] = (perfiles ?? []).map((p: { id: string; nombre: string; email: string | null; rol: string | null; jugador_id: string | null }) => {
    const esp = espejoPorUser.get(p.id)
    const jug = p.jugador_id ? jugPorId.get(p.jugador_id) : null
    const { login, tipo } = esp
      ? { login: esp.usuario_login, tipo: esp.tipo_login as 'email' | 'celular' | 'rut' }
      : usuarioLoginDe({ email: p.email, telefono: jug?.telefono ?? null, rut: jug?.rut ?? null })
    // Preferimos el nombre del jugador cuando existe: la ficha se completa con
    // apellidos y en `perfiles` puede haber quedado el nombre pelado.
    const nombreFinal = (jug?.nombre && jug.nombre.trim().length > (p.nombre?.trim().length ?? 0))
      ? jug.nombre
      : p.nombre
    return {
      usuarioId: p.id,
      jugadorId: p.jugador_id,
      nombre: nombreFinal,
      rol: (p.rol ?? 'jugador') as FilaCredencial['rol'],
      usuarioLogin: login,
      tipoLogin: tipo,
      passwordPlano: esp?.password_plano ?? null,
      actualizadoEn: esp?.actualizado_en ?? null,
      telefono: jug?.telefono ?? null,
    }
  })

  return { filas }
}

/**
 * Genera una clave nueva y la aplica en auth y en el espejo.
 *
 * Los dos pasos van seguidos: si el segundo falla, quedaría el jugador con una
 * clave nueva en auth y el admin viendo la vieja en el reporte, o sea la peor
 * mezcla posible. Por eso el error se propaga sin tocar auth de vuelta —
 * dejarlo con la clave nueva sin espejo se resuelve reintentando; deshacer
 * auth para quedar con la vieja implica generar otra clave y volver a
 * escribirla, que es más frágil.
 */
export async function resetearCredencial(params: { usuarioId: string }): Promise<{ error?: string; password?: string }> {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const { data: perfil } = await admin.from('perfiles').select('id,nombre,email,rol,jugador_id,club_id').eq('id', params.usuarioId).single()
  if (!perfil || perfil.club_id !== clubId) return { error: 'Ese usuario no es de este club' }
  // Misma razón que en el reset masivo: el superadmin aparece en el listado
  // mientras gestiona el club, pero su cuenta no es del club y resetearla lo
  // deja sin acceso a la plataforma.
  if (perfil.rol === 'superadmin') return { error: 'La cuenta de superadmin se administra desde su propio panel' }

  const nuevaPassword = generarPasswordInicial(perfil.nombre)
  const { error: upErr } = await admin.auth.admin.updateUserById(perfil.id, { password: nuevaPassword })
  if (upErr) return { error: 'No se pudo actualizar la contraseña: ' + upErr.message }

  let login = perfil.email ?? ''
  let tipo: 'email' | 'celular' | 'rut' = 'email'
  if (perfil.jugador_id) {
    const { data: jug } = await admin.from('jugadores').select('email,telefono,rut').eq('id', perfil.jugador_id).single()
    const r = usuarioLoginDe({ email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
    if (r.login) { login = r.login; tipo = r.tipo }
    // El dato del jugador pudo cambiar después de creada la cuenta (ficha
    // editada, celular corregido). Sin esto, la clave nueva queda en la cuenta
    // vieja mientras el reporte ya muestra el login nuevo, y el reset "no
    // sirve" a ojos del admin.
    await sincronizarEmailAuth(admin, perfil.id, perfil.email, { email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
  }

  const { error: espejoErr } = await admin.from('credencial_visible').upsert({
    usuario_id: perfil.id, club_id: clubId, password_plano: nuevaPassword,
    usuario_login: login, tipo_login: tipo,
    // Vuelve a habilitar la consulta por RUT. La migración 205 dice que el
    // reseteo del admin "crea una fila nueva sin esta marca", pero acá no se
    // crea nada: el upsert actualiza la fila que ya existe y solo toca las
    // columnas que se le nombran, así que la marca sobrevivía. Resultado: al
    // jugador que ya había consultado su clave una vez, el link por RUT no le
    // servía nunca más —ni después de que el admin le reseteara la clave, que
    // es justamente el camino de recuperación que documenta esa migración.
    primera_consulta_rut_en: null,
  })
  if (espejoErr) return { error: 'Contraseña cambiada, pero no se guardó en el reporte: ' + espejoErr.message }

  return { password: nuevaPassword }
}

/**
 * Reset masivo del club: reescribe usuario y clave para todos los perfiles.
 *
 * El usuario nuevo sigue el patrón `<inicial-nombre><primer-apellido><inicial-
 * segundo-apellido>@cmsports.cl`. Un mismo patrón puede caer más de una vez
 * —dos "Sofia Salgado G"— así que las colisiones internas se resuelven con un
 * numerito al final (`sofiasalgadog2@cmsports.cl`). La clave sigue el patrón
 * `nombreapellido123`.
 *
 * Cambios que trae para los jugadores:
 *   - Los que hoy loguean con celular o RUT quedan solo con ese email nuevo.
 *     El celular sigue en su ficha, pero deja de servir para entrar.
 *   - Las contraseñas que hayan elegido por su cuenta se pierden.
 *
 * Es el trade-off que el admin aceptó: un patrón consistente y visible en el
 * reporte impreso, a costa de reeducar a la gente para que use el email nuevo.
 */
export async function resetearTodasLasCredenciales(): Promise<{ error?: string; cambiadas?: number; fallidas?: number }> {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  // Alcanza a admins, profes y jugadores: la queja del admin fue justamente
  // que se limitaba a jugadores y dejaba huecos en los otros roles.
  //
  // El superadmin queda fuera a propósito. Mientras gestiona un club su perfil
  // lleva el `club_id` de ese club, así que el filtro por club lo incluía y el
  // reset le reescribía email y clave con el patrón `@cmsports.cl` — dejándolo
  // sin acceso a la plataforma completa por una acción sobre un solo club.
  const { data: perfiles } = await admin.from('perfiles')
    .select('id,nombre').eq('club_id', clubId).neq('rol', 'superadmin')
  if (!perfiles?.length) return { cambiadas: 0, fallidas: 0 }

  // Resolvemos colisiones dentro de este batch: si dos nombres generan el
  // mismo email, el segundo lleva "2", el tercero "3", y así. Los fallos por
  // colisión con emails de OTROS clubes se cuentan como fallidas —caen en el
  // update de auth con "email already registered"—.
  const emailsUsados = new Set<string>()
  const emailUnico = (base: string): string => {
    if (!emailsUsados.has(base)) { emailsUsados.add(base); return base }
    let n = 2
    let candidato = base.replace('@cmsports.cl', `${n}@cmsports.cl`)
    while (emailsUsados.has(candidato)) {
      n++
      candidato = base.replace('@cmsports.cl', `${n}@cmsports.cl`)
    }
    emailsUsados.add(candidato)
    return candidato
  }

  let cambiadas = 0
  let fallidas = 0
  for (const p of perfiles as { id: string; nombre: string }[]) {
    const password = generarPasswordInicial(p.nombre)
    const email = emailUnico(generarEmailInicial(p.nombre))

    // Se cambia email y clave en la misma llamada: si falla, no se toca el
    // espejo (queda mostrando lo viejo, coherente con lo que hay en auth).
    const { error: authUpErr } = await admin.auth.admin.updateUserById(p.id, { email, password, email_confirm: true })
    if (authUpErr) { fallidas++; continue }

    // perfiles.email se mantiene alineado con auth.email para que el resto
    // del sistema (que suele leer perfiles) no muestre datos viejos.
    await admin.from('perfiles').update({ email }).eq('id', p.id)

    const { error: espejoErr } = await admin.from('credencial_visible').upsert({
      usuario_id: p.id, club_id: clubId, password_plano: password,
      usuario_login: email, tipo_login: 'email',
      // Misma razón que en el reset individual: si no se limpia, quien ya
      // consultó su clave por RUT queda sin ese camino para siempre.
      primera_consulta_rut_en: null,
    })
    if (espejoErr) fallidas++
    else cambiadas++
  }

  return { cambiadas, fallidas }
}

/**
 * El propio usuario está cambiando su contraseña.
 *
 * Va acá y no directo con `supabase.auth.updateUser` desde el cliente para que
 * el espejo del reporte también se actualice. Antes del cambio, el admin veía
 * la clave vieja hasta el próximo reset, que se vive como un bug de datos.
 *
 * No requiere admin: el propio usuario cambia lo suyo. La sesión es la que
 * dice quién es; no confiamos en un id que pueda venir del cliente.
 */
export async function cambiarPasswordPropia(nuevaPassword: string): Promise<{ error?: string; success?: boolean; avisoEspejo?: string }> {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (nuevaPassword.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  // El id del usuario viene de la sesión, nunca del cliente: quien está
  // llamando puede cambiar únicamente su propia clave.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const admin = createAdminClient()
  const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password: nuevaPassword })
  if (upErr) return { error: 'No se pudo cambiar la contraseña: ' + upErr.message }

  // El espejo aplica solo a usuarios del club. Un superadmin suelto no está en
  // ningún reporte, así que no hay qué sincronizar.
  if (!perfil.club_id) return { success: true }

  let jugData: { email: string | null; telefono: string | null; rut: string | null } | null = null
  if (perfil.jugador_id) {
    const { data } = await admin.from('jugadores').select('email,telefono,rut').eq('id', perfil.jugador_id).single()
    jugData = data
  }
  const { login, tipo } = usuarioLoginDe({
    email: jugData?.email ?? user.email ?? null,
    telefono: jugData?.telefono ?? null,
    rut: jugData?.rut ?? null,
  })
  const { error: espejoErr } = await admin.from('credencial_visible').upsert({
    usuario_id: user.id, club_id: perfil.club_id, password_plano: nuevaPassword,
    usuario_login: login, tipo_login: tipo,
  })
  // La clave YA cambió en auth (línea de arriba); esto solo actualiza el
  // espejo que ve el admin. No se revierte el cambio real si falla — sería
  // peor dejar a la persona sin poder entrar con la clave que acaba de
  // poner —, pero el admin necesita saber que el reporte quedó desactualizado.
  if (espejoErr) return { success: true, avisoEspejo: 'La contraseña se cambió, pero no se pudo actualizar en el reporte de credenciales.' }

  return { success: true }
}

/**
 * Trae la credencial actual de un jugador para armar el mensaje de WhatsApp.
 * Va aparte de `listarCredenciales` porque el perfil del jugador la pide una
 * a la vez y no vale la pena traer toda la tabla del club.
 */
export async function credencialDelJugador(jugadorId: string): Promise<{ error?: string; login?: string; password?: string; nombre?: string }> {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const { data: perfil } = await admin.from("perfiles").select("id,nombre,email,club_id").eq("jugador_id", jugadorId).maybeSingle()
  if (!perfil || perfil.club_id !== clubId) return { error: "Este jugador no tiene cuenta de acceso en tu club" }

  const { data: jug } = await admin.from("jugadores").select("email,telefono,rut").eq("id", jugadorId).single()
  // Aunque ya tenga espejo, el dato del jugador pudo cambiar desde entonces:
  // sin esto se le manda por WhatsApp un login que en auth.users ya no existe.
  await sincronizarEmailAuth(admin, perfil.id, perfil.email, { email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })

  const { data: esp } = await admin.from("credencial_visible").select("password_plano,usuario_login").eq("usuario_id", perfil.id).maybeSingle()
  if (esp?.password_plano) return { login: esp.usuario_login, password: esp.password_plano, nombre: perfil.nombre }

  // Sin espejo NO se genera nada. Antes sí: pedir el mensaje de WhatsApp de
  // alguien le reescribía la contraseña. Si esa persona había elegido la suya,
  // quedaba afuera por una acción que solo pretendía leer.
  //
  // Se devuelve el login —que sí se puede deducir de su ficha— y se avisa que
  // hay que resetear a propósito desde el informe de credenciales.
  const { login } = usuarioLoginDe({ email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
  return {
    error: `No tenemos guardada la contraseña de ${perfil.nombre} (la cambió por su cuenta o es anterior al informe). Usá "Resetear" en Credenciales para generarle una nueva.${login ? ` Su usuario es ${login}.` : ''}`,
  }
}
