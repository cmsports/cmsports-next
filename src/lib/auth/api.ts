import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Quién está llamando a un route handler, con su club.
 *
 * Los cuatro endpoints de archivos repetían este bloque y ninguno preguntaba
 * por el club: su única comprobación era «hay sesión». Como además usan
 * `createAdminClient()`, que se salta RLS, eso significaba que cualquier
 * usuario de cualquier club listaba y abría el material de Buin.
 *
 * El `club_id` sale de `perfiles`, nunca de un parámetro: el cliente no elige
 * de qué club es.
 */
export type SesionApi =
  | { ok: false; error: string; status: number }
  | { ok: true; userId: string; clubId: string; rol: string }

export async function sesionApi(): Promise<SesionApi> {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado', status: 401 }

  const admin = createAdminClient()
  const { data: perfil } = await admin
    .from('perfiles').select('club_id, rol').eq('id', user.id).maybeSingle()

  if (!perfil?.club_id) return { ok: false, error: 'Tu cuenta no tiene club asignado', status: 403 }
  return { ok: true, userId: user.id, clubId: perfil.club_id, rol: perfil.rol ?? 'jugador' }
}

export function esAdminApi(rol: string): boolean {
  return rol === 'admin' || rol === 'superadmin'
}

/**
 * La carpeta del club dentro de un bucket compartido.
 *
 * Los archivos viven en `{club_id}/{nombre}`. Antes iban sueltos en la raíz, y
 * la raíz no tiene dueño: por eso los veía cualquiera. El id sale de la sesión,
 * así que no hay forma de pedir la carpeta de otro club.
 */
export function carpetaDeClub(clubId: string): string {
  return clubId
}

/**
 * Que la ruta pedida esté dentro de la carpeta del club, sin trucos de `..`.
 * Se usa antes de borrar o firmar cualquier archivo que venga del navegador.
 */
export function rutaDelClub(clubId: string, nombreArchivo: string): string | null {
  const limpio = nombreArchivo.replace(/^\/+/, '')
  if (!limpio || limpio.includes('..')) return null
  // Se acepta tanto "archivo.jpg" como "{club_id}/archivo.jpg": la pantalla
  // manda lo que le devolvió el listado.
  const sinCarpeta = limpio.startsWith(`${clubId}/`) ? limpio.slice(clubId.length + 1) : limpio
  if (sinCarpeta.includes('/')) return null
  return `${clubId}/${sinCarpeta}`
}

/** Cuánto vale una URL firmada. Una hora alcanza para leer un PDF y no queda dando vueltas. */
export const SEGUNDOS_URL_FIRMADA = 3600
