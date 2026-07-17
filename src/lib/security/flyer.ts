export const MAX_FLYER_REQUEST_BYTES = 48 * 1024
export const MAX_FLYER_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface CategoriaFlyer {
  nombre: string
  precio: string
  hora: string
}

export interface PremioFlyer {
  lugar: string
  monto: string
}

export interface FlyerPayload {
  tipoEvento: string
  nombreEvento: string
  fecha: string
  categorias: CategoriaFlyer[]
  premios: PremioFlyer[]
  notas: string
  instrucciones: string
  clubNombre: string
  direccion: string
  telefono: string
  referenciaUrl: string
  fotoUrl: string
  logoUrl: string
}

export class FlyerRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FlyerRequestError('Cuerpo inválido')
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, max: number, required = false) {
  if (value == null) value = ''
  if (typeof value !== 'string') throw new FlyerRequestError(`${field} inválido`)
  const result = value.trim()
  if (required && !result) throw new FlyerRequestError(`Falta ${field}`)
  if (result.length > max) throw new FlyerRequestError(`${field} demasiado largo`)
  return result
}

export function parseFlyerPayload(value: unknown): FlyerPayload {
  const input = record(value)
  const categoriasRaw = input.categorias ?? []
  const premiosRaw = input.premios ?? []
  if (!Array.isArray(categoriasRaw) || categoriasRaw.length > 12) {
    throw new FlyerRequestError('Categorías inválidas')
  }
  if (!Array.isArray(premiosRaw) || premiosRaw.length > 10) {
    throw new FlyerRequestError('Premios inválidos')
  }

  const categorias = categoriasRaw.map((item) => {
    const categoria = record(item)
    return {
      nombre: text(categoria.nombre, 'nombre de categoría', 80),
      precio: text(categoria.precio, 'precio', 20),
      hora: text(categoria.hora, 'hora', 8),
    }
  })
  const premios = premiosRaw.map((item) => {
    const premio = record(item)
    return {
      lugar: text(premio.lugar, 'lugar del premio', 80),
      monto: text(premio.monto, 'monto del premio', 20),
    }
  })

  const fecha = text(input.fecha, 'fecha', 10)
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new FlyerRequestError('Fecha inválida')

  return {
    tipoEvento: text(input.tipoEvento, 'tipo de evento', 60),
    nombreEvento: text(input.nombreEvento, 'el nombre del evento', 120, true),
    fecha,
    categorias,
    premios,
    notas: text(input.notas, 'notas', 1200),
    instrucciones: text(input.instrucciones, 'instrucciones', 1200),
    clubNombre: text(input.clubNombre, 'nombre del club', 120),
    direccion: text(input.direccion, 'dirección', 200),
    telefono: text(input.telefono, 'teléfono', 40),
    referenciaUrl: text(input.referenciaUrl, 'la referencia', 2048, true),
    fotoUrl: text(input.fotoUrl, 'la foto', 2048, true),
    logoUrl: text(input.logoUrl, 'logo', 2048),
  }
}

export async function readLimitedJson(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new FlyerRequestError('Content-Type inválido', 415)

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FLYER_REQUEST_BYTES) {
    throw new FlyerRequestError('Solicitud demasiado grande', 413)
  }

  const reader = request.body?.getReader()
  if (!reader) throw new FlyerRequestError('Cuerpo requerido')
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_FLYER_REQUEST_BYTES) {
      await reader.cancel()
      throw new FlyerRequestError('Solicitud demasiado grande', 413)
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new FlyerRequestError('JSON inválido')
  }
}

export function validateStorageImageUrl(
  rawUrl: string,
  expectedBucket: 'flyer-referencias' | 'galeria-fotos',
  clubId: string,
  supabaseBaseUrl: string,
) {
  let candidate: URL
  let base: URL
  try {
    candidate = new URL(rawUrl)
    base = new URL(supabaseBaseUrl)
  } catch {
    throw new FlyerRequestError('URL de imagen inválida')
  }

  if (candidate.origin !== base.origin || candidate.username || candidate.password || candidate.hash) {
    throw new FlyerRequestError('URL de imagen no permitida')
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(candidate.pathname)
  } catch {
    throw new FlyerRequestError('URL de imagen inválida')
  }
  if (decodedPath.includes('\\')) throw new FlyerRequestError('URL de imagen no permitida')
  const parts = decodedPath.split('/')
  if (
    parts.length < 8 ||
    parts[1] !== 'storage' || parts[2] !== 'v1' || parts[3] !== 'object' || parts[4] !== 'public' ||
    parts[5] !== expectedBucket || parts[6] !== clubId ||
    parts.slice(7).some((part) => !part || part === '.' || part === '..')
  ) {
    throw new FlyerRequestError('URL de imagen no permitida')
  }
  return candidate.toString()
}

export async function downloadImage(url: string, fetcher: typeof fetch = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 300 && response.status < 400) {
      throw new FlyerRequestError('La imagen no puede redirigir')
    }
    if (!response.ok) throw new FlyerRequestError('No se pudo descargar una imagen')

    const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || ''
    if (!IMAGE_MIME_TYPES.has(mime)) throw new FlyerRequestError('Formato de imagen no permitido')
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FLYER_IMAGE_BYTES) {
      throw new FlyerRequestError('Imagen demasiado grande')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new FlyerRequestError('La imagen no contiene datos')
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_FLYER_IMAGE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new FlyerRequestError('Imagen demasiado grande')
      }
      chunks.push(value)
    }
    if (!total) throw new FlyerRequestError('La imagen está vacía')

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new Blob([bytes.buffer], { type: mime })
  } finally {
    clearTimeout(timeout)
  }
}

type RateEntry = {
  shortWindow: number
  shortCount: number
  dayWindow: number
  dayCount: number
  inFlight: number
  lastSeen: number
}

const rateStore = new Map<string, RateEntry>()
const SHORT_WINDOW_MS = 5 * 60 * 1000
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000

export function reserveFlyerGeneration(userId: string, now = Date.now()) {
  for (const [key, entry] of rateStore) {
    if (now - entry.lastSeen > DAY_WINDOW_MS) rateStore.delete(key)
  }

  const previous = rateStore.get(userId)
  const entry: RateEntry = previous ?? {
    shortWindow: now,
    shortCount: 0,
    dayWindow: now,
    dayCount: 0,
    inFlight: 0,
    lastSeen: now,
  }
  if (now - entry.shortWindow >= SHORT_WINDOW_MS) {
    entry.shortWindow = now
    entry.shortCount = 0
  }
  if (now - entry.dayWindow >= DAY_WINDOW_MS) {
    entry.dayWindow = now
    entry.dayCount = 0
  }
  if (entry.inFlight >= 1) throw new FlyerRequestError('Ya tienes una generación en curso', 429)
  if (entry.shortCount >= 2) throw new FlyerRequestError('Espera unos minutos antes de generar otro flyer', 429)
  if (entry.dayCount >= 10) throw new FlyerRequestError('Alcanzaste el límite diario de flyers', 429)

  entry.shortCount += 1
  entry.dayCount += 1
  entry.inFlight += 1
  entry.lastSeen = now
  rateStore.set(userId, entry)

  let released = false
  return () => {
    if (released) return
    released = true
    entry.inFlight = Math.max(0, entry.inFlight - 1)
  }
}

export function resetFlyerRateLimitsForTests() {
  rateStore.clear()
}
