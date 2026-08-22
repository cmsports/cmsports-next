import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'

// Pide sesión, igual que sus hermanos. No la pedía: cualquiera en internet
// obtenía la URL del PDF llamando a este endpoint. El comentario del hermano
// `bibliografia/list` daba por hecho que esta ruta ya la exigía —"sus tres
// hermanos (upload, delete y el de libro-profe) sí piden sesión"— y no era
// cierto: era la única de las cuatro que no comprobaba nada.
//
// Sesión sí, rol no: el libro lo abren los profesores desde su pantalla, y
// exigir admin se los dejaría vacío. Subirlo sigue siendo solo de admin.
export async function GET() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  // ponytail: list con search filtra server-side, no baja todo el bucket
  const { data } = await supabase.storage.from(BUCKET).list('', { search: NOMBRE, limit: 1 })
  // La caché pasa a privada: la respuesta ahora depende de quién pregunta, y
  // una pública la dejaría compartida entre usuarios por el CDN.
  if (!data?.length) return Response.json({ url: null }, { headers: { 'Cache-Control': 'private, max-age=60' } })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(NOMBRE)
  return Response.json({ url: publicUrl }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
