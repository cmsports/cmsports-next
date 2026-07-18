import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 52428800, // 50 MB
      allowedMimeTypes: ['application/pdf'],
    })
  }
}

export async function POST(req: Request) {
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
    .from('perfiles').select('rol').eq('id', user.id).single()

  if (!perfil || (perfil.rol !== 'admin' && perfil.rol !== 'superadmin'))
    return Response.json({ error: 'Sin permiso' }, { status: 403 })

  await ensureBucket(supabase)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'Sin archivo' }, { status: 400 })
  if (file.type !== 'application/pdf')
    return Response.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // Reemplaza siempre el mismo archivo
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(NOMBRE, buffer, { contentType: 'application/pdf', upsert: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(NOMBRE)
  return Response.json({ url: publicUrl })
}
