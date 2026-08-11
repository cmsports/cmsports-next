import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { metricasDe, mesAnterior, mesDeFecha, serieMensual } from '@/lib/tecnico/metricas'
import { fechaChile } from '@/lib/domain/fechaChile'

export const runtime = 'nodejs'

type Mensaje = { role: 'user' | 'assistant'; content: string }

type Body = {
  jugadorId?: string
  pregunta?: string
  historial?: Mensaje[]
}

const MAX_PREGUNTA = 800
const MAX_HISTORIAL = 8

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: perfil } = await admin
    .from('perfiles')
    .select('rol, club_id, jugador_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.club_id) {
    return Response.json({ error: 'Sin club asociado' }, { status: 403 })
  }

  const esStaff = ['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')
  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const jugadorId = body.jugadorId?.trim()
  const pregunta = (body.pregunta ?? '').trim()
  if (!jugadorId) return Response.json({ error: 'Falta jugadorId' }, { status: 400 })
  if (!pregunta || pregunta.length > MAX_PREGUNTA) {
    return Response.json({ error: 'Pregunta inválida' }, { status: 400 })
  }

  if (!esStaff && perfil.jugador_id !== jugadorId) {
    return Response.json({ error: 'Sin permiso para este jugador' }, { status: 403 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY no configurada en el servidor' }, { status: 500 })
  }

  // Cuota con el cliente del usuario (auth.uid() en el RPC).
  const cuota = await (supabase as unknown as {
    rpc: (name: string) => Promise<{ error: { code?: string; message: string } | null }>
  }).rpc('consumir_cuota_asesor_tecnico')
  if (cuota.error && cuota.error.code !== 'PGRST202') {
    if (cuota.error.message.includes('Límite')) {
      return Response.json({ error: 'Alcanzaste el límite del asesor técnico (5 cada 5 min / 30 al día).' }, { status: 429 })
    }
    return Response.json({ error: 'No se pudo verificar la cuota del asesor' }, { status: 503 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any
  const clubId = perfil.club_id

  const [{ data: jugador }, { data: sesiones }, { data: eventos }, { data: evaluaciones }, { data: planes }] = await Promise.all([
    db.from('jugadores').select('id,nombre,categoria').eq('id', jugadorId).eq('club_id', clubId).single(),
    db.from('tecnico_sesiones')
      .select('id,titulo,tipo,estado,fecha,rival_nombre,marcador')
      .eq('club_id', clubId)
      .eq('jugador_id', jugadorId)
      .neq('estado', 'archivada')
      .order('fecha', { ascending: false })
      .limit(40),
    db.from('tecnico_eventos')
      .select('golpe_codigo,zona_mesa,resultado,sesion_id')
      .eq('club_id', clubId)
      .eq('jugador_id', jugadorId)
      .limit(3000),
    db.from('tecnico_evaluaciones')
      .select('id,estado,resumen,creado_en,publicada_en')
      .eq('club_id', clubId)
      .eq('jugador_id', jugadorId)
      .order('creado_en', { ascending: false })
      .limit(20),
    db.from('tecnico_plan_jugadores')
      .select('estado,fecha_inicio,plan_id')
      .eq('club_id', clubId)
      .eq('jugador_id', jugadorId)
      .neq('estado', 'archivado')
      .limit(10),
  ])

  if (!jugador) return Response.json({ error: 'Jugador no encontrado' }, { status: 404 })

  const planIds = (planes ?? []).map((p: { plan_id: string }) => p.plan_id).filter(Boolean)
  let planesNombres = new Map<string, { nombre: string; nivel: string | null }>()
  if (planIds.length) {
    const { data: planesData } = await db.from('tecnico_planes')
      .select('id,nombre,nivel')
      .in('id', planIds)
    planesNombres = new Map((planesData ?? []).map((p: { id: string; nombre: string; nivel: string | null }) => [p.id, { nombre: p.nombre, nivel: p.nivel }]))
  }

  const fechaPorSesion = new Map<string, string>((sesiones ?? []).map((s: { id: string; fecha: string }) => [s.id, s.fecha]))
  const eventosConFecha = (eventos ?? []).map((e: { golpe_codigo: string; zona_mesa: number | null; resultado: string; sesion_id: string }) => ({
    ...e,
    fecha: fechaPorSesion.get(e.sesion_id) ?? null,
  }))

  const totales = metricasDe(eventosConFecha, (sesiones ?? []).length)
  const mesActual = fechaChile().slice(0, 7)
  const mesPrev = mesAnterior(mesActual)
  const evActual = eventosConFecha.filter((e: { fecha: string | null }) => mesDeFecha(e.fecha) === mesActual)
  const evPrev = eventosConFecha.filter((e: { fecha: string | null }) => mesDeFecha(e.fecha) === mesPrev)
  const sesActual = (sesiones ?? []).filter((s: { fecha: string }) => mesDeFecha(s.fecha) === mesActual)
  const sesPrev = (sesiones ?? []).filter((s: { fecha: string }) => mesDeFecha(s.fecha) === mesPrev)
  const mActual = metricasDe(evActual, sesActual.length)
  const mPrev = metricasDe(evPrev, sesPrev.length)
  const serie = serieMensual(eventosConFecha, sesiones ?? [], 6)

  const evalIds = (evaluaciones ?? []).map((e: { id: string }) => e.id)
  let items: { evaluacion_id: string; codigo: string; nombre: string; estado: string; comentario: string | null }[] = []
  if (evalIds.length) {
    const { data } = await db.from('tecnico_evaluacion_items')
      .select('evaluacion_id,codigo,nombre,estado,comentario')
      .in('evaluacion_id', evalIds)
    items = data ?? []
  }

  const contexto = {
    jugador: { nombre: jugador.nombre, categoria: jugador.categoria },
    totales,
    mesActual: { mes: mesActual, ...mActual },
    mesAnterior: { mes: mesPrev, ...mPrev },
    serieMensual: serie,
    sesionesRecientes: (sesiones ?? []).slice(0, 8).map((s: { fecha: string; titulo: string; tipo: string; rival_nombre: string | null; marcador: string | null }) => ({
      fecha: s.fecha,
      titulo: s.titulo,
      tipo: s.tipo,
      rival: s.rival_nombre,
      marcador: s.marcador,
    })),
    evaluaciones: (evaluaciones ?? []).slice(0, 6).map((eva: { estado: string; resumen: string | null; id: string }) => ({
      estado: eva.estado,
      resumen: eva.resumen,
      items: items.filter(i => i.evaluacion_id === eva.id).map(i => ({
        codigo: i.codigo,
        nombre: i.nombre,
        estado: i.estado,
        comentario: i.comentario,
      })),
    })),
    planes: (planes ?? []).map((p: { estado: string; fecha_inicio: string; plan_id: string }) => ({
      nombre: planesNombres.get(p.plan_id)?.nombre ?? 'Plan',
      nivel: planesNombres.get(p.plan_id)?.nivel ?? null,
      estado: p.estado,
      desde: p.fecha_inicio,
    })),
  }

  const historial = (body.historial ?? [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORIAL)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_PREGUNTA) }))

  const system = `Eres un asesor técnico de tenis de mesa para profesores de CMsports (Chile).
Respondes en español, claro y accionable.
Usas SOLO el contexto numérico y de evaluaciones entregado. No inventes partidos, rivales ni estadísticas.
Si la muestra es pequeña (pocos eventos o sesiones), dilo y recomienda registrar más datos.
Prioriza consejos prácticos: focos de la semana, ejercicios, qué observar en video, riesgos.
No reemplazas al profesor: tus sugerencias son apoyo, no veredicto oficial.
Máximo ~250 palabras salvo que pidan detalle.`

  const userContent = `Contexto del jugador (JSON):\n${JSON.stringify(contexto)}\n\nPregunta del profesor/jugador:\n${pregunta}`

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        ...historial,
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!openaiRes.ok) {
    const detalle = await openaiRes.text().catch(() => '')
    console.error('asesor tecnico openai', openaiRes.status, detalle.slice(0, 500))
    return Response.json({ error: 'No se pudo generar el análisis IA' }, { status: 502 })
  }

  const data = await openaiRes.json()
  const respuesta = data?.choices?.[0]?.message?.content?.trim()
  if (!respuesta) return Response.json({ error: 'Respuesta vacía de la IA' }, { status: 502 })

  await db.from('tecnico_asesor_consultas').insert({
    club_id: clubId,
    usuario_id: user.id,
    jugador_id: jugadorId,
    pregunta: pregunta.slice(0, MAX_PREGUNTA),
    respuesta_chars: respuesta.length,
    modelo: 'gpt-4o-mini',
  })

  return Response.json({
    ok: true,
    respuesta,
    aviso: 'Sugerencia asistida por IA. La fuente de verdad sigue siendo el etiquetado y la evaluación del profesor.',
  })
}
