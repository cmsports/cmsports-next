'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { cleanOptionalText, storagePathFromPublicUrl, validateImageUpload } from '@/lib/security/uploads'

const TIPOS_FOTO = new Set(['jugador', 'cancha', 'equipo', 'otro'])

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Error inesperado'
}

export async function subirReferenciaAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  try {
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File)) return { error: 'Archivo requerido' }
    const nombre = cleanOptionalText(formData.get('nombre'), 80, 'Nombre')
    const valid = await validateImageUpload(archivo)
    const path = `${clubId}/${crypto.randomUUID()}.${valid.extension}`
    const storage = supabase!.storage.from('flyer-referencias')
    const { error: uploadError } = await storage.upload(path, archivo, {
      contentType: valid.mime,
      upsert: false,
    })
    if (uploadError) return { error: uploadError.message }

    const { data: pub } = storage.getPublicUrl(path)
    const { error: insertError } = await supabase!.from('flyer_referencias').insert({
      club_id: clubId!,
      url: pub.publicUrl,
      nombre,
    })
    if (insertError) {
      await storage.remove([path])
      return { error: insertError.message }
    }
    return { ok: true }
  } catch (uploadError) {
    return { error: message(uploadError) }
  }
}

export async function eliminarReferenciaAction(id: string) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const { data: referencia, error: lookupError } = await supabase!
    .from('flyer_referencias')
    .select('url')
    .eq('id', id)
    .eq('club_id', clubId!)
    .maybeSingle()
  if (lookupError) return { error: lookupError.message }
  if (!referencia) return { error: 'Referencia no encontrada' }

  try {
    const path = storagePathFromPublicUrl(referencia.url, 'flyer-referencias', clubId!)
    const { error: storageError } = await supabase!.storage.from('flyer-referencias').remove([path])
    if (storageError) return { error: storageError.message }
  } catch (storageError) {
    return { error: message(storageError) }
  }

  const { error: deleteError } = await supabase!
    .from('flyer_referencias')
    .delete()
    .eq('id', id)
    .eq('club_id', clubId!)
  if (deleteError) return { error: deleteError.message }
  return { ok: true }
}

export async function marcarReferenciaPredeterminadaAction(id: string) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const { error: clearError } = await supabase!
    .from('flyer_referencias')
    .update({ predeterminada: false })
    .eq('club_id', clubId!)
  if (clearError) return { error: clearError.message }

  const { data: selected, error: setError } = await supabase!
    .from('flyer_referencias')
    .update({ predeterminada: true })
    .eq('id', id)
    .eq('club_id', clubId!)
    .select('id')
    .maybeSingle()
  if (setError) return { error: setError.message }
  if (!selected) return { error: 'Referencia no encontrada' }
  return { ok: true }
}

export async function subirFotoGaleriaAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  try {
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File)) return { error: 'Archivo requerido' }
    const tipoRaw = cleanOptionalText(formData.get('tipo'), 20, 'Tipo') || 'jugador'
    if (!TIPOS_FOTO.has(tipoRaw)) return { error: 'Tipo de foto inválido' }
    const jugadorId = cleanOptionalText(formData.get('jugador_id'), 36, 'Jugador')
    if (jugadorId) {
      const { data: jugador, error: jugadorError } = await supabase!
        .from('jugadores')
        .select('id')
        .eq('id', jugadorId)
        .eq('club_id', clubId!)
        .maybeSingle()
      if (jugadorError) return { error: jugadorError.message }
      if (!jugador) return { error: 'Jugador no encontrado en el club' }
    }

    const valid = await validateImageUpload(archivo)
    const path = `${clubId}/${crypto.randomUUID()}.${valid.extension}`
    const storage = supabase!.storage.from('galeria-fotos')
    const { error: uploadError } = await storage.upload(path, archivo, {
      contentType: valid.mime,
      upsert: false,
    })
    if (uploadError) return { error: uploadError.message }

    const { data: pub } = storage.getPublicUrl(path)
    const { error: insertError } = await supabase!.from('fotos_galeria').insert({
      club_id: clubId!,
      url: pub.publicUrl,
      tipo: tipoRaw,
      jugador_id: jugadorId,
    })
    if (insertError) {
      await storage.remove([path])
      return { error: insertError.message }
    }
    return { ok: true }
  } catch (uploadError) {
    return { error: message(uploadError) }
  }
}

export async function eliminarFotoGaleriaAction(id: string) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  const { data: foto, error: lookupError } = await supabase!
    .from('fotos_galeria')
    .select('url')
    .eq('id', id)
    .eq('club_id', clubId!)
    .maybeSingle()
  if (lookupError) return { error: lookupError.message }
  if (!foto) return { error: 'Foto no encontrada' }

  try {
    const path = storagePathFromPublicUrl(foto.url, 'galeria-fotos', clubId!)
    const { error: storageError } = await supabase!.storage.from('galeria-fotos').remove([path])
    if (storageError) return { error: storageError.message }
  } catch (storageError) {
    return { error: message(storageError) }
  }

  const { error: deleteError } = await supabase!
    .from('fotos_galeria')
    .delete()
    .eq('id', id)
    .eq('club_id', clubId!)
  if (deleteError) return { error: deleteError.message }
  return { ok: true }
}

export async function actualizarInfoClubAction(direccion: string, telefono: string) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }
  const direccionLimpia = direccion.trim()
  const telefonoLimpio = telefono.trim()
  if (direccionLimpia.length > 200) return { error: 'Dirección demasiado larga' }
  if (telefonoLimpio.length > 40) return { error: 'Teléfono demasiado largo' }

  const { error: updateError } = await supabase!
    .from('clubes')
    .update({ direccion: direccionLimpia, telefono: telefonoLimpio })
    .eq('id', clubId!)
  if (updateError) return { error: updateError.message }
  return { ok: true }
}

export async function subirLogoAction(formData: FormData) {
  const { error, supabase, clubId } = await requireAdminClub()
  if (error) return { error }

  try {
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File)) return { error: 'Archivo requerido' }
    const valid = await validateImageUpload(archivo)
    const { data: club } = await supabase!.from('clubes').select('logo_url').eq('id', clubId!).maybeSingle()
    const path = `${clubId}/logo-${crypto.randomUUID()}.${valid.extension}`
    const storage = supabase!.storage.from('flyer-referencias')
    const { error: uploadError } = await storage.upload(path, archivo, {
      contentType: valid.mime,
      upsert: false,
    })
    if (uploadError) return { error: uploadError.message }

    const { data: pub } = storage.getPublicUrl(path)
    const { error: updateError } = await supabase!
      .from('clubes')
      .update({ logo_url: `${pub.publicUrl}?v=${Date.now()}` })
      .eq('id', clubId!)
    if (updateError) {
      await storage.remove([path])
      return { error: updateError.message }
    }

    if (club?.logo_url) {
      try {
        const oldPath = storagePathFromPublicUrl(club.logo_url, 'flyer-referencias', clubId!)
        if (oldPath !== path) await storage.remove([oldPath])
      } catch {
        // Una URL histórica externa no debe impedir guardar el logo nuevo.
      }
    }
    return { ok: true }
  } catch (uploadError) {
    return { error: message(uploadError) }
  }
}
