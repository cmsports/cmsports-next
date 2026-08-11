import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Body = { videoId?: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: perfil } = await admin
    .from('perfiles')
    .select('rol, club_id')
    .eq('id', user.id)
    .single()

  if (!perfil || !['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')) {
    return Response.json({ error: 'Sin permiso' }, { status: 403 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const videoId = body.videoId?.trim()
  if (!videoId) return Response.json({ error: 'Falta videoId' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any
  const { data: video, error: videoError } = await db.from('tecnico_videos')
    .select('id,club_id,estado_procesamiento')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    return Response.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  if (perfil.rol !== 'superadmin' && video.club_id !== perfil.club_id) {
    return Response.json({ error: 'El video no pertenece a tu club' }, { status: 403 })
  }

  if (video.estado_procesamiento === 'procesando') {
    return Response.json({ error: 'El video ya se está optimizando' }, { status: 409 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  }

  const script = join(process.cwd(), 'scripts', 'procesar-video-tecnico.mjs')
  const envFile = join(process.cwd(), '.env.local')
  const child = spawn(
    process.execPath,
    ['--env-file', envFile, script, videoId],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    },
  )

  child.on('error', async () => {
    await db.from('tecnico_videos')
      .update({
        estado_procesamiento: 'error',
        error_procesamiento: 'No se pudo iniciar el proceso local de FFmpeg.',
      })
      .eq('id', videoId)
  })

  child.unref()

  return Response.json({
    ok: true,
    mensaje: 'Optimización iniciada. El estado se actualizará solo cuando termine.',
  })
}
