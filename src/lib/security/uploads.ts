import { FlyerRequestError, validateStorageImageUrl } from './flyer'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const MIME_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

type AllowedMime = keyof typeof MIME_EXTENSION

function matchesSignature(mime: AllowedMime, bytes: Uint8Array) {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value)
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

export async function validateImageUpload(file: File) {
  if (!file.size) throw new Error('El archivo está vacío')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('La imagen supera el máximo de 10 MB')
  if (!(file.type in MIME_EXTENSION)) throw new Error('Solo se permiten imágenes JPG, PNG o WebP')

  const buffer = await file.arrayBuffer()
  if (buffer.byteLength !== file.size || buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Tamaño de archivo inválido')
  }
  const mime = file.type as AllowedMime
  if (!matchesSignature(mime, new Uint8Array(buffer))) {
    throw new Error('El contenido no corresponde al formato declarado')
  }
  return { extension: MIME_EXTENSION[mime], mime }
}

export function storagePathFromPublicUrl(
  rawUrl: string,
  bucket: 'flyer-referencias' | 'galeria-fotos',
  clubId: string,
  supabaseBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '',
) {
  try {
    const valid = new URL(validateStorageImageUrl(rawUrl, bucket, clubId, supabaseBaseUrl))
    const prefix = `/storage/v1/object/public/${bucket}/`
    return decodeURIComponent(valid.pathname.slice(prefix.length))
  } catch (error) {
    if (error instanceof FlyerRequestError) throw new Error(error.message)
    throw error
  }
}

export function cleanOptionalText(value: FormDataEntryValue | null, max: number, field: string) {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`${field} inválido`)
  const cleaned = value.trim()
  if (cleaned.length > max) throw new Error(`${field} demasiado largo`)
  return cleaned || null
}
