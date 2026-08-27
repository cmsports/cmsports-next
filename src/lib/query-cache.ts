'use client'

// Cache en memoria para queries de Supabase.
// Se limpia automáticamente cuando el usuario hace logout (llamar a clearAll()).
// Deduplication: si la misma key se pide dos veces a la vez, solo lanza 1 fetch.

const DEFAULT_TTL = 60_000 // 1 minuto

type Entry<T> = { data: T; ts: number; ttl: number }
type Inflight<T> = Promise<T>

const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Inflight<unknown>>()

// De qué tablas salió cada clave. Sin esto, invalidar depende de que alguien se
// acuerde de escribir la llamada a mano en cada pantalla, y acordarse no escala:
// Finanzas importaba `invalidate` y nunca llegó a llamarlo. El resultado es el
// peor de los dos mundos —la pantalla se entera del cambio, pide los datos de
// nuevo y el caché le devuelve los viejos—, que se ve igual que un bug de datos.
const fuentes = new Map<string, string[]>()

// `null` es un valor legítimo para una consulta (un jugador sin ficha, un
// torneo sin final). Devolver `null` tanto para "no está en caché" como para
// "está y vale null" hacía que esas consultas nunca acertaran: se repetían en
// cada render hasta que algo más las llenara. El sentinel distingue los dos.
const MISS = Symbol('cache-miss')

function leer<T>(key: string): T | typeof MISS {
  const e = store.get(key) as Entry<T> | undefined
  if (!e) return MISS
  if (Date.now() - e.ts > e.ttl) { store.delete(key); return MISS }
  return e.data
}

export function getCached<T>(key: string): T | null {
  const v = leer<T>(key)
  return v === MISS ? null : v
}

export function setCached<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, ts: Date.now(), ttl })
}

export function invalidate(keyOrPrefix: string): void {
  for (const k of store.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ':')) { store.delete(k); fuentes.delete(k) }
  }
}

/**
 * Tira lo que salió de esa tabla. Lo llama `useEnVivo` cuando la tabla cambia,
 * así el caché no puede quedar sirviendo lo viejo detrás de una pantalla que sí
 * se enteró del cambio.
 */
export function invalidarPorTabla(tabla: string): void {
  for (const [clave, tablas] of fuentes) {
    if (!tablas.includes(tabla)) continue
    store.delete(clave)
    // También la petición en vuelo: salió antes del cambio, así que va a
    // guardar datos ya viejos apenas vuelva.
    inflight.delete(clave)
    fuentes.delete(clave)
  }
}

export function clearAll(): void {
  store.clear()
  inflight.clear()
  fuentes.clear()
}

// Fetch con deduplication: si ya hay un fetch en vuelo con esta key, devuelve la misma promise.
//
// `tablas` es de qué tablas salen estos datos. Declararlas es lo que permite que
// el caché se tire solo cuando alguna cambia, en vez de esperar a que venza el
// minuto o a que alguien invalide a mano desde la pantalla.
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL,
  tablas: string[] = [],
): Promise<T> {
  const hit = leer<T>(key)
  if (hit !== MISS) return hit

  if (inflight.has(key)) return inflight.get(key) as Promise<T>

  // Las tablas se anotan al LANZAR la consulta, no al recibirla: si se anotaran
  // al volver, un cambio ocurrido mientras la consulta viajaba no encontraría la
  // clave y el resultado viejo terminaría igual en el caché.
  if (tablas.length > 0) fuentes.set(key, tablas)

  const promise = fetcher().then(data => {
    // Si mientras la consulta estaba en vuelo llegó un cambio en alguna de sus
    // tablas, `invalidarPorTabla` ya borró la petición: guardar el resultado
    // ahora sería volver a meter en el caché justo lo que se acaba de tirar.
    if (inflight.has(key)) {
      setCached(key, data, ttl)
      inflight.delete(key)
    }
    return data
  }).catch(err => {
    inflight.delete(key)
    fuentes.delete(key)
    throw err
  })

  inflight.set(key, promise as Inflight<unknown>)
  return promise
}
