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

// Los datos de transferencia del club. Vivían en `galeria-fotos` con URL
// pública: el número de cuenta de cada club se abría sin sesión con solo tener
// el enlace, y el club_id no es un secreto. El club va en la segunda carpeta
// porque es lo que mira la política del bucket — `foldername(name)[2]`.
export function rutaCentralPago(clubId: string) {
  return `central-pago/${clubId}/datos.jpg`
}

// Facturas de CmSports (empresa), no de un club. La primera carpeta las deja
// fuera de las dos políticas del bucket, que comparan `foldername(name)[2]`
// contra el club de quien mira: acá esa posición es 'pagos' o 'gastos' y no
// calza con ningún UUID, así que solo se alcanzan con la service key desde una
// Server Action que ya verificó superadmin. Ver migración 255.
export const CARPETA_FACTURAS = 'facturas-cmsports'

export function rutaFacturaCmsports(tipo: 'pagos' | 'gastos', id: string, ext: string) {
  return `${CARPETA_FACTURAS}/${tipo}/${id}.${ext}`
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
