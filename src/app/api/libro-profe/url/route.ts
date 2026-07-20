import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'

export async function GET() {
  const supabase = createAdminClient()
  // ponytail: list con search filtra server-side, no baja todo el bucket
  const { data } = await supabase.storage.from(BUCKET).list('', { search: NOMBRE, limit: 1 })
  if (!data?.length) return Response.json({ url: null }, { headers: { 'Cache-Control': 'public, max-age=60' } })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(NOMBRE)
  return Response.json({ url: publicUrl }, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
