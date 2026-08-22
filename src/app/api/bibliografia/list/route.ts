import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'bibliografia-buin'

// Este endpoint usa el cliente admin, que se salta RLS, y hasta ahora no pedía
// sesión: cualquiera podía listar todos los archivos de la bibliografía del
// club. El bucket es público, así que el contenido ya era alcanzable con la
// URL — lo que se filtraba era la ENUMERACIÓN, o sea saber qué archivos hay.
// Los dos de subir y el de borrar sí piden sesión; este se había quedado
// afuera. (El comentario decía que el de libro-profe también la pedía, y no era
// cierto: se arregló en la misma pasada.)
//
// Se pide sesión pero NO rol de admin a propósito: la bibliografía la leen los
// profesores y jugadores desde su propia pantalla, y exigir admin la dejaría
// vacía para ellos. Escribir y borrar siguen siendo solo de admin.
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list('', { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return Response.json([], { status: 200 })

  const archivos = (data ?? [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      name: f.name,
      url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
    }))

  // El listado depende de quién pregunta, así que la caché va privada: con
  // `public` un proxy podría guardarlo y servírselo a alguien sin sesión.
  return Response.json(archivos, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}
