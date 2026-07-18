import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from(BUCKET).list('')
  const existe = data?.some(f => f.name === NOMBRE)
  if (!existe) return Response.json({ url: null }, { headers: { 'Cache-Control': 'no-store' } })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(NOMBRE)
  return Response.json({ url: publicUrl }, { headers: { 'Cache-Control': 'no-store' } })
}
