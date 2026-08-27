import { createAdminClient } from '@/lib/supabase/admin'
import { carpetaDeClub, sesionApi, SEGUNDOS_URL_FIRMADA } from '@/lib/auth/api'

const BUCKET = 'bibliografia-buin'

// Este endpoint usa el cliente admin, que se salta RLS. Antes su única
// comprobación era «hay sesión», y el bucket era público: cualquier usuario
// autenticado —de cualquiera de los cuatro clubes de la base— listaba y abría
// el material de Buin, y la URL que se llevaba no caducaba nunca.
//
// Ahora se lista SOLO la carpeta del club de quien pregunta (`{club_id}/`) y
// las URL van firmadas, con vencimiento. El bucket pasó a privado en la
// migración 220.
//
// Se pide sesión pero NO rol de admin, a propósito: la bibliografía la leen los
// profesores y jugadores desde su propia pantalla. Escribir y borrar siguen
// siendo solo de admin.
export async function GET() {
  const sesion = await sesionApi()
  if (!sesion.ok) return Response.json({ error: sesion.error }, { status: sesion.status })

  const supabase = createAdminClient()
  const carpeta = carpetaDeClub(sesion.clubId)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(carpeta, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return Response.json([], { status: 200 })

  const nombres = (data ?? [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => `${carpeta}/${f.name}`)

  if (nombres.length === 0) {
    return Response.json([], { headers: { 'Cache-Control': 'private, max-age=30' } })
  }

  // Una firma por lote en vez de una llamada por archivo.
  const { data: firmadas } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(nombres, SEGUNDOS_URL_FIRMADA)

  const archivos = (firmadas ?? [])
    .filter(f => !f.error && f.signedUrl)
    .map(f => ({
      // La pantalla muestra el nombre del archivo, no la carpeta interna.
      name: (f.path ?? '').split('/').pop() ?? '',
      url: f.signedUrl,
    }))

  // El listado depende de quién pregunta, así que la caché va privada: con
  // `public` un proxy podría guardarlo y servírselo a alguien sin sesión.
  // Además ahora las URL caducan, así que no conviene cachearlas mucho.
  return Response.json(archivos, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}
