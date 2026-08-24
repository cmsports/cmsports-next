import { marcarGanadorPartido } from '@/app/actions/torneos'

export async function POST(req: Request) {
  const { partidoId, ganadorId, setsA, setsB, parciales } = await req.json()
  // Grupos mandan marcador (el ganador se deriva de él); playoff manda ganadorId.
  // Los parciales set a set son lo que manda la pantalla de grupos: de ahí salen
  // los sets y los puntos. La acción valida cuál corresponde según la fase.
  if (!partidoId) return Response.json({ error: 'Faltan datos' }, { status: 400 })
  if (!ganadorId && typeof setsA !== 'number' && !Array.isArray(parciales)) {
    return Response.json({ error: 'Faltan datos' }, { status: 400 })
  }
  const result = await marcarGanadorPartido({ partidoId, ganadorId, setsA, setsB, parciales })
  return Response.json(result)
}
