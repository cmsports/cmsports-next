import { createAdminClient } from '@/lib/supabase/admin'
import { esAdminApi, rutaDelClub, sesionApi } from '@/lib/auth/api'

const BUCKET = 'bibliografia-buin'

export async function DELETE(req: Request) {
  const sesion = await sesionApi()
  if (!sesion.ok) return Response.json({ error: sesion.error }, { status: sesion.status })
  if (!esAdminApi(sesion.rol)) return Response.json({ error: 'Sin permiso' }, { status: 403 })

  const { nombre } = await req.json() as { nombre: string }
  if (!nombre) return Response.json({ error: 'Falta nombre' }, { status: 400 })

  // El nombre llega del navegador y el cliente admin se salta RLS: sin este
  // chequeo, mandar `otro-club-id/archivo.pdf` borraba el material ajeno.
  // `rutaDelClub` lo ancla a la carpeta de la sesión y rechaza los `..`.
  const ruta = rutaDelClub(sesion.clubId, nombre)
  if (!ruta) return Response.json({ error: 'Nombre de archivo inválido' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).remove([ruta])
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
