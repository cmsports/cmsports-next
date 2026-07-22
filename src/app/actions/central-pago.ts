'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminClub } from '@/lib/auth/require'

export async function subirImagenCentralPago(params: { base64: string }) {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const mimeMatch = params.base64.match(/^data:(image\/\w+);base64,/)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const buffer = Buffer.from(params.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  const path = `central-pago/${clubId!}`

  const admin = createAdminClient()
  const { error } = await admin.storage.from('galeria-fotos').upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) return { error: 'Error al subir imagen: ' + error.message }

  const { data: { publicUrl } } = admin.storage.from('galeria-fotos').getPublicUrl(path)
  return { success: true, url: `${publicUrl}?t=${Date.now()}` }
}
