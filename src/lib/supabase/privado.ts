import { createClient } from '@/lib/supabase/client'

// Bucket privado: fotos de jugadores y contratos firmados. A diferencia de
// `galeria-fotos`, sus archivos no tienen URL pública — hay que firmarlas y el
// enlace vence solo, así un link reenviado por WhatsApp deja de servir.
export const BUCKET_PRIVADO = 'privado'

const VENCIMIENTO_SEGUNDOS = 60 * 60 // 1 hora

export function rutaFotoJugador(clubId: string, jugadorId: string) {
  return `avatares/${clubId}/${jugadorId}.jpg`
}

export function rutaDocumentoJugador(clubId: string, jugadorId: string, tipo: string, ext: string) {
  return `documentos/${clubId}/${jugadorId}/${tipo}.${ext}`
}

export async function firmarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data } = await createClient().storage
    .from(BUCKET_PRIVADO)
    .createSignedUrl(path, VENCIMIENTO_SEGUNDOS)
  return data?.signedUrl ?? null
}

// Firma muchas rutas de una sola vez: el listado de jugadores muestra más de
// cien fotos y una petición por cada una haría la página inusable.
export async function firmarUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const limpias = [...new Set(paths.filter((p): p is string => !!p))]
  if (limpias.length === 0) return {}

  const { data } = await createClient().storage
    .from(BUCKET_PRIVADO)
    .createSignedUrls(limpias, VENCIMIENTO_SEGUNDOS)

  const mapa: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl
  }
  return mapa
}
