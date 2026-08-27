import { createAdminClient } from '@/lib/supabase/admin'
import { carpetaDeClub, esAdminApi, sesionApi, SEGUNDOS_URL_FIRMADA } from '@/lib/auth/api'

const BUCKET = 'libro-profe-buin'
const NOMBRE = 'libro.pdf'
const TOPE_BYTES = 25 * 1024 * 1024

export async function POST(req: Request) {
  const sesion = await sesionApi()
  if (!sesion.ok) return Response.json({ error: sesion.error }, { status: sesion.status })
  if (!esAdminApi(sesion.rol)) return Response.json({ error: 'Sin permiso' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'Sin archivo' }, { status: 400 })
  if (file.type !== 'application/pdf') {
    return Response.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 })
  }
  if (file.size > TOPE_BYTES) {
    return Response.json({ error: 'El PDF pesa más de 25 MB' }, { status: 400 })
  }

  const supabase = createAdminClient()
  // A la carpeta del club, no a la raíz: la raíz no tiene dueño.
  const ruta = `${carpetaDeClub(sesion.clubId)}/${NOMBRE}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Reemplaza siempre el mismo archivo del club
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, buffer, { contentType: 'application/pdf', upsert: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA)
  return Response.json({ url: data?.signedUrl ?? null })
}
