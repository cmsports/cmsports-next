import { NextRequest } from 'next/server'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearZip } from '@/lib/zip'
import { respaldarClub, respaldarGlobales, carpeta } from '@/lib/respaldo'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'

// GET /api/superadmin/respaldo            -> todos los clubes
// GET /api/superadmin/respaldo?club=<id>  -> uno solo
//
// ponytail: arma el zip entero en memoria. Con los volúmenes de hoy (miles de
// filas por club) son unos pocos MB; si algún día un club solo pesa cientos de
// MB, hay que pasar a streaming por club en vez de un zip único.
export async function GET(req: NextRequest) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return Response.json({ error: authErr }, { status: 403 })

  const clubId = req.nextUrl.searchParams.get('club')
  const admin = createAdminClient()

  const { data: clubes, error } = await admin.from('clubes').select('id,nombre')
    .order('nombre')
  if (error) return Response.json({ error: 'No se pudieron listar los clubes' }, { status: 500 })

  const seleccionados = clubId ? (clubes || []).filter(c => c.id === clubId) : (clubes || [])
  if (!seleccionados.length) return Response.json({ error: 'Club no encontrado' }, { status: 404 })

  const archivos: { nombre: string; contenido: string }[] = []
  const resumen: Record<string, Record<string, number>> = {}

  try {
    for (const club of seleccionados) {
      const datos = await respaldarClub(admin, club.id)
      const dir = `${carpeta(club.nombre)}`
      resumen[club.nombre] = {}
      for (const [tabla, filas] of Object.entries(datos)) {
        resumen[club.nombre][tabla] = filas.length
        archivos.push({ nombre: `${dir}/${tabla}.json`, contenido: JSON.stringify(filas, null, 1) })
      }
    }
    const globales = await respaldarGlobales(admin)
    resumen['_global'] = {}
    for (const [tabla, filas] of Object.entries(globales)) {
      resumen['_global'][tabla] = filas.length
      archivos.push({ nombre: `_global/${tabla}.json`, contenido: JSON.stringify(filas, null, 1) })
    }
  } catch (e) {
    // Un respaldo a medias es peor que ninguno: si una tabla falla, no se
    // entrega el zip como si estuviera completo.
    return Response.json({ error: `El respaldo se interrumpió: ${(e as Error).message}` }, { status: 500 })
  }

  const fecha = fechaChile()
  archivos.unshift({
    nombre: 'respaldo.json',
    contenido: JSON.stringify({
      generado: `${fecha} ${horaChile()} (hora de Chile)`,
      clubes: seleccionados.map(c => c.nombre),
      filas_por_tabla: resumen,
      formato: 'Una carpeta por club; un JSON por tabla con las filas tal cual salieron de la base.',
    }, null, 2),
  })

  const zip = crearZip(archivos)
  const nombre = clubId
    ? `cmsports-${carpeta(seleccionados[0].nombre)}-${fecha}.zip`
    : `cmsports-respaldo-completo-${fecha}.zip`

  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nombre.replace(/[^\w.-]/g, '_')}"`,
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store',
    },
  })
}
