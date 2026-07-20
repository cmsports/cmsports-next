import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'bibliografia-buin'

export async function GET() {
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

  return Response.json(archivos, {
    headers: { 'Cache-Control': 'public, max-age=30' },
  })
}
