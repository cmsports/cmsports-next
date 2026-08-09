'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminClub } from '@/lib/auth/require'
import { BUCKET_PRIVADO, rutaCentralPago } from '@/lib/supabase/privado'

// Los datos de transferencia del club son la imagen que el jugador mira para
// pagar. Estaban en `galeria-fotos`, que es público: el número de cuenta se
// abría sin sesión con solo tener el enlace. Ahora van al bucket privado y la
// pantalla los firma, con el mismo criterio que las fotos de los jugadores.

export async function subirImagenCentralPago(params: { base64: string }) {
  const { error: authErr, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const mimeMatch = params.base64.match(/^data:(image\/\w+);base64,/)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const buffer = Buffer.from(params.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  const path = rutaCentralPago(clubId!)

  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET_PRIVADO)
    .upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) return { error: 'Error al subir imagen: ' + error.message }

  // Se borra la copia pública vieja. Mismo patrón que `subirFotoJugador`: si
  // solo se subiera la nueva, el enlace público anterior seguiría mostrando el
  // número de cuenta a cualquiera que lo tuviera guardado.
  await admin.storage.from('galeria-fotos').remove([`central-pago/${clubId!}`])

  const { data: firmada } = await admin.storage.from(BUCKET_PRIVADO).createSignedUrl(path, 3600)
  return { success: true, url: firmada?.signedUrl ?? null }
}
