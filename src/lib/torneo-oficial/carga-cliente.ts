'use client'

import { getCached, cachedFetch, invalidate } from '@/lib/query-cache'

/** TTL largo: los datos se invalidan por realtime, no por tiempo. */
export const TTL_OFICIAL = 120_000

/**
 * Muestra datos cacheados al instante al volver a la pantalla.
 * `silencioso` evita el spinner cuando ya hay contenido en pantalla.
 */
export async function cargarOficialConCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: {
    tablas: string[]
    silencioso?: boolean
    aplicar: (data: T) => void
    setLoading: (v: boolean) => void
    tieneDatos: () => boolean
  },
): Promise<T> {
  const hit = getCached<T>(key)
  if (hit !== null) {
    opts.aplicar(hit)
    opts.setLoading(false)
  } else if (!opts.silencioso && !opts.tieneDatos()) {
    opts.setLoading(true)
  }

  const data = await cachedFetch(key, fetcher, TTL_OFICIAL, opts.tablas)
  opts.aplicar(data)
  opts.setLoading(false)
  return data
}

/** Invalida cache de una pantalla oficial tras mutaciones (resultados, cupos, etc.). */
export function invalidarCacheOficial(key: string) {
  invalidate(key)
}
