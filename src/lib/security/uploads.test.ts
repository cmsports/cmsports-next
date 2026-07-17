import { describe, expect, it } from 'vitest'
import { storagePathFromPublicUrl, validateImageUpload } from './uploads'

function fakeFile(bytes: number[], type: string): File {
  const array = Uint8Array.from(bytes)
  return {
    size: array.byteLength,
    type,
    arrayBuffer: async () => array.buffer,
  } as File
}

describe('cargas de imágenes', () => {
  it('valida MIME y firma real', async () => {
    const png = fakeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png')
    await expect(validateImageUpload(png)).resolves.toEqual({ extension: 'png', mime: 'image/png' })
    await expect(validateImageUpload(fakeFile([1, 2, 3], 'image/png'))).rejects.toThrow('formato declarado')
    await expect(validateImageUpload(fakeFile([1, 2, 3], 'text/html'))).rejects.toThrow('Solo se permiten')
  })

  it('extrae únicamente rutas Storage del club', () => {
    const url = 'https://demo.supabase.co/storage/v1/object/public/galeria-fotos/club-1/foto.png?v=1'
    expect(storagePathFromPublicUrl(url, 'galeria-fotos', 'club-1', 'https://demo.supabase.co'))
      .toBe('club-1/foto.png')
    expect(() => storagePathFromPublicUrl(url, 'galeria-fotos', 'club-2', 'https://demo.supabase.co'))
      .toThrow('no permitida')
  })
})
