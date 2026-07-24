'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'galeria-fotos'

async function requireProfesor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', admin: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil?.club_id || !['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? ''))
    return { error: 'Acceso denegado', admin: null, clubId: null }
  return { error: null, admin: createAdminClient(), clubId: perfil.club_id as string }
}

function parsearBase64(base64: string) {
  const mime = base64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg'
  const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  return { mime, buffer }
}

async function subirImagen(admin: ReturnType<typeof createAdminClient>, clubId: string, id: string, base64: string) {
  const { mime, buffer } = parsearBase64(base64)
  const path = `tienda-buin/${clubId}/${id}`
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: mime, upsert: true })
  if (error) return null
  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return `${publicUrl}?t=${Date.now()}`
}

export async function crearProductoTienda(params: {
  nombre: string
  descripcion: string
  categoria: string
  color: string
  stock: number
  precio: number | null
  base64: string | null
}) {
  const { error, admin, clubId } = await requireProfesor()
  if (error || !admin || !clubId) return { error }

  const { data: prod, error: insertErr } = await (admin as any)
    .from('tienda_buin_productos')
    .insert({
      club_id: clubId,
      nombre: params.nombre.trim(),
      descripcion: params.descripcion?.trim() || null,
      categoria: params.categoria,
      color: params.color?.trim() || null,
      stock: params.stock,
      precio: params.precio ?? null,
      imagen_url: null,
    })
    .select('id')
    .single()

  if (insertErr || !prod) return { error: 'Error al crear: ' + insertErr?.message }

  if (params.base64) {
    const url = await subirImagen(admin, clubId, prod.id, params.base64)
    if (url) await (admin as any).from('tienda_buin_productos').update({ imagen_url: url }).eq('id', prod.id)
  }

  return { success: true }
}

export async function editarProductoTienda(params: {
  id: string
  nombre: string
  descripcion: string
  categoria: string
  color: string
  stock: number
  precio: number | null
  base64?: string | null
}) {
  const { error, admin, clubId } = await requireProfesor()
  if (error || !admin || !clubId) return { error }

  const updates: Record<string, unknown> = {
    nombre: params.nombre.trim(),
    descripcion: params.descripcion?.trim() || null,
    categoria: params.categoria,
    color: params.color?.trim() || null,
    stock: params.stock,
    precio: params.precio ?? null,
  }

  if (params.base64) {
    const url = await subirImagen(admin, clubId, params.id, params.base64)
    if (url) updates.imagen_url = url
  }

  await (admin as any).from('tienda_buin_productos').update(updates).eq('id', params.id).eq('club_id', clubId)
  return { success: true }
}

export async function eliminarProductoTienda(params: { id: string }) {
  const { error, admin, clubId } = await requireProfesor()
  if (error || !admin || !clubId) return { error }

  await admin.storage.from(BUCKET).remove([`tienda-buin/${clubId}/${params.id}`])
  await (admin as any).from('tienda_buin_productos').delete().eq('id', params.id).eq('club_id', clubId)
  return { success: true }
}
