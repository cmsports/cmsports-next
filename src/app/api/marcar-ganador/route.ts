import { marcarGanadorPartido } from '@/app/actions/torneos'

export async function POST(req: Request) {
  const { partidoId, ganadorId } = await req.json()
  if (!partidoId || !ganadorId) return Response.json({ error: 'Faltan datos' }, { status: 400 })
  const result = await marcarGanadorPartido({ partidoId, ganadorId })
  return Response.json(result)
}
