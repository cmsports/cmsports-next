'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

function extension(file: File) {
  const fromName = file.name.split('.').pop()
  if (fromName && fromName.length <= 4) return fromName.toLowerCase()
  return file.type.split('/')[1] || 'png'
}

export async function subirReferenciaAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const archivo = formData.get('archivo') as File | null
  const nombre = (formData.get('nombre') as string) || null
  if (!archivo) return { error: 'Archivo requerido' }

  const path = `${clubId}/${crypto.randomUUID()}.${extension(archivo)}`
  const { error: uploadError } = await supabase!.storage.from('flyer-referencias').upload(path, archivo)
  if (uploadError) return { error: uploadError.message }

  const { data: pub } = supabase!.storage.from('flyer-referencias').getPublicUrl(path)
  const { error: insertError } = await supabase!.from('flyer_referencias').insert({
    club_id: clubId!,
    url: pub.publicUrl,
    nombre,
  })
  if (insertError) return { error: insertError.message }

  return { ok: true }
}

export async function eliminarReferenciaAction(id: string) {
  const { error, supabase } = await requireAdminClub()
  if (error) return { error }

  const { error: deleteError } = await supabase!.from('flyer_referencias').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }
  return { ok: true }
}

export async function subirFotoGaleriaAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const archivo = formData.get('archivo') as File | null
  const tipo = (formData.get('tipo') as string) || 'jugador'
  const jugadorId = (formData.get('jugador_id') as string) || null
  if (!archivo) return { error: 'Archivo requerido' }

  const path = `${clubId}/${crypto.randomUUID()}.${extension(archivo)}`
  const { error: uploadError } = await supabase!.storage.from('galeria-fotos').upload(path, archivo)
  if (uploadError) return { error: uploadError.message }

  const { data: pub } = supabase!.storage.from('galeria-fotos').getPublicUrl(path)
  const { error: insertError } = await supabase!.from('fotos_galeria').insert({
    club_id: clubId!,
    url: pub.publicUrl,
    tipo,
    jugador_id: jugadorId,
  })
  if (insertError) return { error: insertError.message }

  return { ok: true }
}

export async function eliminarFotoGaleriaAction(id: string) {
  const { error, supabase } = await requireAdminClub()
  if (error) return { error }

  const { error: deleteError } = await supabase!.from('fotos_galeria').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }
  return { ok: true }
}

export async function subirLogoAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const archivo = formData.get('archivo') as File | null
  if (!archivo) return { error: 'Archivo requerido' }

  const path = `${clubId}/logo.${extension(archivo)}`
  const { error: uploadError } = await supabase!.storage.from('flyer-referencias').upload(path, archivo, { upsert: true })
  if (uploadError) return { error: uploadError.message }

  const { data: pub } = supabase!.storage.from('flyer-referencias').getPublicUrl(path)
  const { error: updateError } = await supabase!.from('clubes').update({ logo_url: `${pub.publicUrl}?v=${Date.now()}` }).eq('id', clubId!)
  if (updateError) return { error: updateError.message }

  return { ok: true }
}
