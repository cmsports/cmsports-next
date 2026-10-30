import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET_PRIVADO, rutaFotoJugador } from '@/lib/supabase/privado'

/**
 * Borra la ficha de un jugador: el RPC atómico y, después, su cuenta de acceso
 * y sus archivos. Antes del borrado se leen el perfil y los documentos, porque
 * después ya no hay de dónde sacar el user_id de Auth ni las rutas.
 *
 * `rpc` es el cliente con el que se llama a `eliminar_jugador_atomico`: el de la
 * sesión cuando lo pide un admin (así audit_log guarda quién fue), o el admin
 * cuando lo hace el sistema solo, al finalizar un torneo.
 *
 * No vive en un archivo `'use server'` a propósito: recibe un id y usa el
 * cliente admin, y ahí sería un endpoint público. Quien la llama ya validó
 * permisos y club.
 *
 * Devuelve el mensaje de error del borrado, o null si quedó borrado.
 */
export async function borrarFichaJugador(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: SupabaseClient<any>
  clubId: string
  jugadorId: string
}): Promise<string | null> {
  const admin = createAdminClient()

  const { data: perfilJugador } = await admin.from('perfiles')
    .select('id').eq('jugador_id', params.jugadorId).maybeSingle()
  const { data: documentos } = await admin.from('jugador_documentos')
    .select('archivo_path').eq('jugador_id', params.jugadorId)

  const { error } = await params.rpc.rpc('eliminar_jugador_atomico', { p_jugador_id: params.jugadorId })
  if (error) {
    console.error('eliminar_jugador_atomico falló', params.jugadorId, error)
    return error.message
  }

  // Si tenía cuenta de acceso, borrarla de Auth para no dejar fantasmas
  // (credencial_visible cae sola por ON DELETE CASCADE hacia auth.users).
  if (perfilJugador?.id) await admin.auth.admin.deleteUser(perfilJugador.id)

  // Limpieza de archivos best-effort: la ficha ya no existe, y un archivo
  // huérfano en el bucket privado no se ve desde ninguna pantalla.
  const rutasStorage = (documentos ?? []).map(d => d.archivo_path).filter(Boolean) as string[]
  rutasStorage.push(rutaFotoJugador(params.clubId, params.jugadorId))
  await admin.storage.from(BUCKET_PRIVADO).remove(rutasStorage)
  await admin.storage.from('galeria-fotos').remove([`avatares/${params.jugadorId}.jpg`])

  return null
}
