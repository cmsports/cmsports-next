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
 * Devuelve `{ error }` si la ficha NO se borró, o `{ aviso? }` si se borró: el
 * aviso aparece cuando la ficha ya no existe pero su cuenta de acceso no se
 * pudo eliminar (la persona no podría volver a postular con ese correo hasta
 * que alguien borre la cuenta a mano).
 */
export async function borrarFichaJugador(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: SupabaseClient<any>
  clubId: string
  jugadorId: string
}): Promise<{ error: string } | { aviso?: string }> {
  const admin = createAdminClient()

  const { data: perfilJugador } = await admin.from('perfiles')
    .select('id').eq('jugador_id', params.jugadorId).maybeSingle()
  const { data: documentos } = await admin.from('jugador_documentos')
    .select('archivo_path').eq('jugador_id', params.jugadorId)

  const { error } = await params.rpc.rpc('eliminar_jugador_atomico', { p_jugador_id: params.jugadorId })
  if (error) {
    console.error('eliminar_jugador_atomico falló', params.jugadorId, error)
    return { error: error.message }
  }

  // Si tenía cuenta de acceso, borrarla de Auth para no dejar fantasmas
  // (credencial_visible cae sola por ON DELETE CASCADE hacia auth.users).
  // La ficha ya se fue y eso no se revierte, pero si la cuenta queda viva
  // se avisa en vez de responder "listo".
  let aviso: string | undefined
  if (perfilJugador?.id) {
    const { error: errCuenta } = await admin.auth.admin.deleteUser(perfilJugador.id)
    if (errCuenta) aviso = `Se eliminó la ficha, pero su cuenta de acceso no se pudo borrar (${errCuenta.message}); con ese correo no podrá volver a postular hasta que se borre a mano.`
  }

  // Limpieza de archivos best-effort, a propósito: la ficha ya no existe, y un
  // archivo huérfano en el bucket privado no se ve desde ninguna pantalla.
  const rutasStorage = (documentos ?? []).map(d => d.archivo_path).filter(Boolean) as string[]
  rutasStorage.push(rutaFotoJugador(params.clubId, params.jugadorId))
  await admin.storage.from(BUCKET_PRIVADO).remove(rutasStorage)
  await admin.storage.from('galeria-fotos').remove([`avatares/${params.jugadorId}.jpg`])

  return aviso ? { aviso } : {}
}
