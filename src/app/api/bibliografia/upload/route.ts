import { createAdminClient } from '@/lib/supabase/admin'
import { carpetaDeClub, esAdminApi, sesionApi } from '@/lib/auth/api'

const BUCKET = 'bibliografia-buin'

// Los archivos van a `{club_id}/`, nunca sueltos en la raíz: la raíz no tiene
// dueño y era lo que dejaba que cualquier club viera el material de otro.
//
// Se valida tipo y tamaño acá además de en el bucket (migración 220). Antes no
// se validaba nada y la extensión salía de `file.name`: subir un `.html` a un
// bucket público es un XSS alojado en el dominio de Storage.
const TIPOS_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const EXT_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
const TOPE_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  const sesion = await sesionApi()
  if (!sesion.ok) return Response.json({ error: sesion.error }, { status: sesion.status })
  if (!esAdminApi(sesion.rol)) return Response.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = createAdminClient()
  const carpeta = carpetaDeClub(sesion.clubId)

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  if (!files.length) return Response.json({ error: 'Sin archivos' }, { status: 400 })

  const resultados: string[] = []
  const errores: string[] = []
  for (const file of files) {
    if (!TIPOS_OK.has(file.type)) {
      errores.push(`${file.name}: solo se aceptan imágenes (JPG, PNG, WEBP) y PDF`)
      continue
    }
    if (file.size > TOPE_BYTES) {
      errores.push(`${file.name}: pesa más de 10 MB`)
      continue
    }
    // La extensión sale del tipo declarado, no del nombre que mandó el
    // navegador: el nombre lo elige quien sube.
    const ext = EXT_POR_TIPO[file.type]
    const nombre = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nombre, buffer, { contentType: file.type, upsert: false })
    if (!error) resultados.push(nombre)
    else errores.push(`${file.name}: ${error.message}`)
  }

  return Response.json({ subidos: resultados.length, errores })
}
