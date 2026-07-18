import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'bibliografia-buin'

export async function POST(req: Request) {
  // Verificar que el usuario es admin
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

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  if (!files.length) return Response.json({ error: 'Sin archivos' }, { status: 400 })

  const resultados: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const nombre = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nombre, buffer, { contentType: file.type, upsert: false })
    if (!error) resultados.push(nombre)
  }

  return Response.json({ subidos: resultados.length })
}
