import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadImage,
  FlyerRequestError,
  parseFlyerPayload,
  readLimitedJson,
  reserveFlyerGeneration,
  resetFlyerRateLimitsForTests,
  validateStorageImageUrl,
} from './flyer'

const basePayload = {
  tipoEvento: 'Torneo',
  nombreEvento: 'Aniversario',
  fecha: '2026-08-01',
  categorias: [],
  referenciaUrl: 'https://demo.supabase.co/storage/v1/object/public/flyer-referencias/club-1/ref.png',
  fotoUrl: 'https://demo.supabase.co/storage/v1/object/public/galeria-fotos/club-1/foto.png',
}

afterEach(() => resetFlyerRateLimitsForTests())

describe('seguridad del generador de flyers', () => {
  it('limita campos y colecciones del cuerpo', () => {
    expect(parseFlyerPayload(basePayload).nombreEvento).toBe('Aniversario')
    expect(() => parseFlyerPayload({ ...basePayload, categorias: Array(13).fill({}) })).toThrow('Categorías inválidas')
    expect(() => parseFlyerPayload({ ...basePayload, instrucciones: 'x'.repeat(1201) })).toThrow('demasiado largo')
  })

  it('lee JSON con límite y content-type estricto', async () => {
    const request = new Request('https://cmsports.test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(basePayload),
    })
    expect(await readLimitedJson(request)).toMatchObject({ nombreEvento: 'Aniversario' })

    const wrongType = new Request('https://cmsports.test/api', { method: 'POST', body: '{}' })
    await expect(readLimitedJson(wrongType)).rejects.toMatchObject({ status: 415 })
  })

  it('acepta únicamente bucket y carpeta del club exactos', () => {
    expect(validateStorageImageUrl(
      basePayload.fotoUrl,
      'galeria-fotos',
      'club-1',
      'https://demo.supabase.co',
    )).toBe(basePayload.fotoUrl)
    expect(() => validateStorageImageUrl(
      'https://demo.supabase.co.evil.test/storage/v1/object/public/galeria-fotos/club-1/a.png',
      'galeria-fotos',
      'club-1',
      'https://demo.supabase.co',
    )).toThrow('no permitida')
    expect(() => validateStorageImageUrl(
      basePayload.fotoUrl,
      'galeria-fotos',
      'club-2',
      'https://demo.supabase.co',
    )).toThrow('no permitida')
  })

  it('rechaza redirecciones y respuestas que no son imágenes', async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.test' } }))
    await expect(downloadImage(basePayload.fotoUrl, redirect)).rejects.toThrow('no puede redirigir')

    const html = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    await expect(downloadImage(basePayload.fotoUrl, html)).rejects.toThrow('Formato de imagen')
  })

  it('cancela el stream al superar 10 MB sin depender de Content-Length', async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024)
    let sent = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent < 2) {
          controller.enqueue(chunk)
          sent += 1
        } else {
          controller.close()
        }
      },
      cancel() {
        cancelled = true
      },
    }, { highWaterMark: 0 })
    const oversized = vi.fn(async () => new Response(stream, {
      headers: { 'content-type': 'image/png' },
    }))

    await expect(downloadImage(basePayload.fotoUrl, oversized)).rejects.toThrow('Imagen demasiado grande')
    expect(cancelled).toBe(true)
  })

  it('limita concurrencia, ráfaga y cuota', () => {
    const releaseFirst = reserveFlyerGeneration('user-1', 1000)
    expect(() => reserveFlyerGeneration('user-1', 1000)).toThrow('en curso')
    releaseFirst()
    const releaseSecond = reserveFlyerGeneration('user-1', 1000)
    releaseSecond()
    expect(() => reserveFlyerGeneration('user-1', 1000)).toThrow(FlyerRequestError)
  })
})
