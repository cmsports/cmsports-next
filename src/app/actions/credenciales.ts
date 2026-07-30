'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { generarPasswordInicial, usuarioLoginDe } from '@/lib/domain/credenciales'

export type FilaCredencial = {
  usuarioId: string
  jugadorId: string | null
  nombre: string
  rol: 'admin' | 'superadmin' | 'profesor' | 'jugador'
  usuarioLogin: string
  tipoLogin: 'email' | 'celular' | 'rut'
  passwordPlano: string | null    // null si el jugador ya la cambió y nunca se reseteó desde acá
  actualizadoEn: string | null
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
    admin.from('jugadores').select('id,telefono,rut').eq('club_id', clubId),
  ])

  // Jugadores por id para completar el login cuando el perfil no lo tiene.
  const jugPorId = new Map((jugadores ?? []).map((j: { id: string; telefono: string | null; rut: string | null }) => [j.id, j]))
  const espejoPorUser = new Map(
    (espejos ?? []).map((e: { usuario_id: string; password_plano: string; usuario_login: string; tipo_login: string; actualizado_en: string }) => [e.usuario_id, e]),
  )

  const filas: FilaCredencial[] = (perfiles ?? []).map((p: { id: string; nombre: string; email: string | null; rol: string | null; jugador_id: string | null }) => {
    const esp = espejoPorUser.get(p.id)
    const jug = p.jugador_id ? jugPorId.get(p.jugador_id) : null
    const { login, tipo } = esp
      ? { login: esp.usuario_login, tipo: esp.tipo_login as 'email' | 'celular' | 'rut' }
      : usuarioLoginDe({ email: p.email, telefono: jug?.telefono ?? null, rut: jug?.rut ?? null })
    return {
      usuarioId: p.id,
      jugadorId: p.jugador_id,
      nombre: p.nombre,
      rol: (p.rol ?? 'jugador') as FilaCredencial['rol'],
      usuarioLogin: login,
      tipoLogin: tipo,
      passwordPlano: esp?.password_plano ?? null,
      actualizadoEn: esp?.actualizado_en ?? null,
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

  const nuevaPassword = generarPasswordInicial(perfil.nombre)
  const { error: upErr } = await admin.auth.admin.updateUserById(perfil.id, { password: nuevaPassword })
  if (upErr) return { error: 'No se pudo actualizar la contraseña: ' + upErr.message }

  let login = perfil.email ?? ''
  let tipo: 'email' | 'celular' | 'rut' = 'email'
  if (perfil.jugador_id) {
    const { data: jug } = await admin.from('jugadores').select('email,telefono,rut').eq('id', perfil.jugador_id).single()
    const r = usuarioLoginDe({ email: jug?.email, telefono: jug?.telefono, rut: jug?.rut })
    if (r.login) { login = r.login; tipo = r.tipo }
  }

  const { error: espejoErr } = await admin.from('credencial_visible').upsert({
    usuario_id: perfil.id, club_id: clubId, password_plano: nuevaPassword,
    usuario_login: login, tipo_login: tipo,
  })
  if (espejoErr) return { error: 'Contraseña cambiada, pero no se guardó en el reporte: ' + espejoErr.message }

  return { password: nuevaPassword }
}

/**
 * Sincroniza la tabla espejo con todos los jugadores actuales del club.
 *
 * One-shot para poner al día lo que hoy no está guardado: recorre cada perfil
 * de jugador, le asigna la clave `nombreapellido123` y la escribe en auth y en
 * el espejo. Se puede correr más de una vez: cae en el mismo estado, así que
 * no hace daño.
 *
 * Cambia las contraseñas actuales aunque el jugador ya haya elegido la suya.
 * Es lo que el admin espera del reporte inicial —consistencia total con el
 * PDF impreso que reparte—; después cada jugador la cambia si quiere.
 */
export async function resetearTodasLasCredenciales(): Promise<{ error?: string; cambiadas?: number; fallidas?: number }> {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const { data: perfiles } = await admin.from('perfiles')
    .select('id,nombre,email,jugador_id').eq('club_id', clubId).eq('rol', 'jugador')
  if (!perfiles?.length) return { cambiadas: 0, fallidas: 0 }

  const jugadorIds = perfiles.map((p: { jugador_id: string | null }) => p.jugador_id).filter(Boolean) as string[]
  const { data: jugadores } = await admin.from('jugadores')
    .select('id,email,telefono,rut').in('id', jugadorIds)
  const jugPorId = new Map((jugadores ?? []).map((j: { id: string; email: string | null; telefono: string | null; rut: string | null }) => [j.id, j]))

  let cambiadas = 0
  let fallidas = 0
  for (const p of perfiles as { id: string; nombre: string; email: string | null; jugador_id: string | null }[]) {
    const password = generarPasswordInicial(p.nombre)
    const { error: upErr } = await admin.auth.admin.updateUserById(p.id, { password })
    if (upErr) { fallidas++; continue }

    const jug = p.jugador_id ? jugPorId.get(p.jugador_id) : null
    const { login, tipo } = usuarioLoginDe({ email: p.email, telefono: jug?.telefono ?? null, rut: jug?.rut ?? null })
    const { error: espejoErr } = await admin.from('credencial_visible').upsert({
      usuario_id: p.id, club_id: clubId, password_plano: password,
      usuario_login: login, tipo_login: tipo,
    })
    if (espejoErr) fallidas++
    else cambiadas++
  }

  return { cambiadas, fallidas }
}
