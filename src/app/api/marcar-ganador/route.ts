import { marcarGanadorPartido } from '@/app/actions/torneos'

export async function POST(req: Request) {
  const { partidoId, ganadorId, setsA, setsB } = await req.json()
  // Grupos mandan marcador (el ganador se deriva de él); playoff manda ganadorId.
  // La acción valida cuál corresponde según la fase del partido.
  if (!partidoId) return Response.json({ error: 'Faltan datos' }, { status: 400 })
  if (!ganadorId && typeof setsA !== 'number') return Response.json({ error: 'Faltan datos' }, { status: 400 })
  const result = await marcarGanadorPartido({ partidoId, ganadorId, setsA, setsB })
  return Response.json(result)
}
