import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'bibliografia-buin'

export async function DELETE(req: Request) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || (perfil.rol !== 'admin' && perfil.rol !== 'superadmin')) {
    return Response.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { nombre } = await req.json() as { nombre: string }
  if (!nombre) return Response.json({ error: 'Falta nombre' }, { status: 400 })

  const { error } = await supabase.storage.from(BUCKET).remove([nombre])
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
