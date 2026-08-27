import { marcarGanadorPartido } from '@/app/actions/torneos'

// Esta ruta existe por un motivo concreto y sigue haciendo falta: la Server
// Action equivalente pasa por el protocolo RSC de Next, que serializa el árbol
// completo, y en la pantalla de torneo (más de 2.000 líneas, 30 hooks) eso
// reventaba Safari en iPhone por memoria. Ver el comentario en
// src/app/torneos/[id]/page.tsx, donde se la llama.
//
// Lo que sí le faltaba: un route handler NO tiene la comprobación de origen que
// Next le hace sola a las Server Actions. En la práctica la cookie de Supabase
// es SameSite=Lax y no viaja en un POST de otro sitio, así que no había un
// agujero explotable — pero eso es una propiedad de la cookie, no de esta ruta,
// y no conviene que la única defensa viva en otra capa.
//
// La autorización de fondo la sigue haciendo `marcarGanadorPartido`, que llama
// a `requireAdmin()`: acá no se decide quién puede, solo de dónde puede venir.
function mismoSitio(req: Request): boolean {
  // Los navegadores modernos mandan Sec-Fetch-Site; es la señal más directa.
  const fetchSite = req.headers.get('sec-fetch-site')
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'same-site'

  // Sin ese header, se compara Origin contra Host.
  const origin = req.headers.get('origin')
  if (!origin) return true // navegación directa o cliente sin Origin: lo resuelve requireAdmin
  const host = req.headers.get('host')
  try {
    return !!host && new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  if (!mismoSitio(req)) {
    return Response.json({ error: 'Origen no permitido' }, { status: 403 })
  }

  let cuerpo: { partidoId?: unknown; ganadorId?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const { partidoId, ganadorId } = cuerpo
  if (typeof partidoId !== 'string' || typeof ganadorId !== 'string' || !partidoId || !ganadorId) {
    return Response.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const result = await marcarGanadorPartido({ partidoId, ganadorId })
  return Response.json(result)
}
