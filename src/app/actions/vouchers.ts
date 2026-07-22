'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil?.club_id || !['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  }
  return { error: null, supabase, clubId: perfil.club_id! }
}

export async function subirVoucher(params: { nombre: string; base64: string }) {
  const { error: authErr, clubId } = await requireStaff()
  if (authErr) return { error: authErr }

  const mimeMatch = params.base64.match(/^data:(image\/\w+);base64,/)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const buffer = Buffer.from(params.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')

  const admin = createAdminClient()

  // Insertar primero para obtener el id
  const { data: voucher, error: insertErr } = await admin
    .from('vouchers')
    .insert({ club_id: clubId!, nombre: params.nombre.trim(), imagen_url: '' })
    .select('id')
    .single()
  if (insertErr || !voucher) return { error: 'Error al crear voucher: ' + insertErr?.message }

  const path = `vouchers/${clubId}/${voucher.id}`
  const { error: upErr } = await admin.storage.from('galeria-fotos').upload(path, buffer, { contentType: mimeType, upsert: true })
  if (upErr) {
    await admin.from('vouchers').delete().eq('id', voucher.id)
    return { error: 'Error al subir imagen: ' + upErr.message }
  }

  const { data: { publicUrl } } = admin.storage.from('galeria-fotos').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`
  await admin.from('vouchers').update({ imagen_url: url }).eq('id', voucher.id)

  return { success: true, voucher: { id: voucher.id, nombre: params.nombre.trim(), imagen_url: url, activo: true } }
}

export async function eliminarVoucher(params: { id: string }) {
  const { error: authErr, clubId } = await requireStaff()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  await admin.storage.from('galeria-fotos').remove([`vouchers/${clubId}/${params.id}`])
  await admin.from('vouchers').delete().eq('id', params.id).eq('club_id', clubId!)
  return { success: true }
}

export async function toggleVoucher(params: { id: string; activo: boolean }) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  await admin.from('vouchers').update({ activo: params.activo }).eq('id', params.id)
  return { success: true }
}
