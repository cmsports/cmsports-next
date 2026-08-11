import { createClient } from '@supabase/supabase-js'
import { createWriteStream } from 'node:fs'
import { readFile, unlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'

const videoId = process.argv[2]
if (!videoId) {
  console.error('Uso: node scripts/procesar-video-tecnico.mjs <video_id>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const { data: video, error: loadError } = await supabase
  .from('tecnico_videos')
  .select('id,club_id,jugador_id,sesion_id,archivo_path,nombre,estado_procesamiento')
  .eq('id', videoId)
  .single()

if (loadError || !video) {
  throw new Error(`No se encontró el video: ${loadError?.message ?? videoId}`)
}

if (video.estado_procesamiento === 'procesando') {
  throw new Error('El video ya aparece como procesando.')
}

const trabajo = join(tmpdir(), `cmsports-video-${crypto.randomUUID()}`)
const originalPath = join(trabajo, `original${extname(video.nombre) || '.mp4'}`)
const analisisPathLocal = join(trabajo, 'analisis.mp4')

async function actualizar(cambios) {
  const { error } = await supabase.from('tecnico_videos').update(cambios).eq('id', videoId)
  if (error) throw error
}

function ejecutarFFmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const proceso = spawn('ffmpeg', [
      '-y',
      '-i', input,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    let stderr = ''
    proceso.stderr.on('data', chunk => { stderr += chunk.toString() })
    proceso.on('error', reject)
    proceso.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg terminó con código ${code}: ${stderr.slice(-1200)}`))
    })
  })
}

try {
  await mkdir(trabajo, { recursive: true })
  await actualizar({ estado_procesamiento: 'procesando', error_procesamiento: null })

  const { data: signed, error: signedError } = await supabase.storage
    .from('tecnico-videos')
    .createSignedUrl(video.archivo_path, 60 * 60)
  if (signedError || !signed?.signedUrl) throw signedError ?? new Error('No se pudo firmar el original')

  const respuesta = await fetch(signed.signedUrl)
  if (!respuesta.ok || !respuesta.body) throw new Error(`No se pudo descargar el original (${respuesta.status})`)
  await pipeline(Readable.fromWeb(respuesta.body), createWriteStream(originalPath))

  await ejecutarFFmpeg(originalPath, analisisPathLocal)

  const analisisBytes = await readFile(analisisPathLocal)
  const analisisPath = `videos/${video.club_id}/${video.jugador_id}/${video.sesion_id}-analisis.mp4`
  const { error: uploadError } = await supabase.storage
    .from('tecnico-videos')
    .upload(analisisPath, analisisBytes, { contentType: 'video/mp4', upsert: true })
  if (uploadError) throw uploadError

  await actualizar({
    analisis_path: analisisPath,
    estado_procesamiento: 'listo',
    mime_analisis: 'video/mp4',
    tamano_analisis: analisisBytes.byteLength,
    resolucion_analisis: '720p',
    procesado_en: new Date().toISOString(),
    error_procesamiento: null,
  })

  console.log(`Video procesado correctamente: ${videoId}`)
  console.log(`Versión de análisis: ${analisisPath}`)
} catch (error) {
  const mensaje = error instanceof Error ? error.message : String(error)
  await actualizar({ estado_procesamiento: 'error', error_procesamiento: mensaje.slice(0, 2000) })
  console.error(mensaje)
  process.exitCode = 1
} finally {
  await Promise.all([
    unlink(originalPath).catch(() => {}),
    unlink(analisisPathLocal).catch(() => {}),
  ])
}
