'use client'

// Cache en memoria para queries de Supabase.
// Se limpia automáticamente cuando el usuario hace logout (llamar a clearAll()).
// Deduplication: si la misma key se pide dos veces a la vez, solo lanza 1 fetch.

const DEFAULT_TTL = 60_000 // 1 minuto

type Entry<T> = { data: T; ts: number; ttl: number }
type Inflight<T> = Promise<T>

const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Inflight<unknown>>()

export function getCached<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined
  if (!e) return null
  if (Date.now() - e.ts > e.ttl) { store.delete(key); return null }
  return e.data
}

export function setCached<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, ts: Date.now(), ttl })
}

export function invalidate(keyOrPrefix: string): void {
  for (const k of store.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ':')) store.delete(k)
  }
}

export function clearAll(): void {
  store.clear()
  inflight.clear()
}

// Fetch con deduplication: si ya hay un fetch en vuelo con esta key, devuelve la misma promise.
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL,
): Promise<T> {
  const hit = getCached<T>(key)
  if (hit !== null) return hit

  if (inflight.has(key)) return inflight.get(key) as Promise<T>

  const promise = fetcher().then(data => {
    setCached(key, data, ttl)
    inflight.delete(key)
    return data
  }).catch(err => {
    inflight.delete(key)
    throw err
  })

  inflight.set(key, promise as Inflight<unknown>)
  return promise
}
