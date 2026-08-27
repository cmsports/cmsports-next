import { createAdminClient } from '@/lib/supabase/admin'
import { carpetaDeClub, sesionApi, SEGUNDOS_URL_FIRMADA } from '@/lib/auth/api'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'

// Cada club tiene su libro en `{club_id}/libro.pdf`. Antes había uno solo en la
// raíz del bucket, el bucket era público y esta ruta solo pedía sesión: el
// libro de Buin lo abría cualquier usuario de cualquier club, y la URL que
// devolvía no caducaba.
//
// Sesión sí, rol no: el libro lo abren los profesores desde su pantalla, y
// exigir admin se los dejaría vacío. Subirlo sigue siendo solo de admin.
export async function GET() {
  const sesion = await sesionApi()
  if (!sesion.ok) return Response.json({ error: sesion.error }, { status: sesion.status })

  const supabase = createAdminClient()
  const ruta = `${carpetaDeClub(sesion.clubId)}/${NOMBRE}`

  // La caché va privada: la respuesta depende de quién pregunta y la URL
  // firmada es de un solo dueño.
  const cabeceras = { 'Cache-Control': 'private, max-age=60' }

  const { data: existe } = await supabase.storage
    .from(BUCKET)
    .list(carpetaDeClub(sesion.clubId), { search: NOMBRE, limit: 1 })
  if (!existe?.length) return Response.json({ url: null }, { headers: cabeceras })

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA)
  if (error || !data?.signedUrl) return Response.json({ url: null }, { headers: cabeceras })

  return Response.json({ url: data.signedUrl }, { headers: cabeceras })
}
