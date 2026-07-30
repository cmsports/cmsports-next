import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedFetch, clearAll, getCached, invalidarPorTabla, invalidate } from './query-cache'

beforeEach(() => clearAll())

describe('invalidarPorTabla', () => {
  it('tira lo que salió de esa tabla y deja el resto', async () => {
    await cachedFetch('fin:jugadores:c1', async () => ['ana'], 60_000, ['jugadores'])
    await cachedFetch('fin:profesores:c1', async () => ['jorge'], 60_000, ['profesores'])

    invalidarPorTabla('jugadores')

    expect(getCached('fin:jugadores:c1')).toBeNull()
    expect(getCached('fin:profesores:c1')).toEqual(['jorge'])
  })

  it('alcanza a las claves que declaran varias tablas', async () => {
    await cachedFetch('mixto', async () => 'x', 60_000, ['jugadores', 'mensualidades'])
    invalidarPorTabla('mensualidades')
    expect(getCached('mixto')).toBeNull()
  })

  it('no toca lo que no declaró tablas', async () => {
    await cachedFetch('suelto', async () => 'x', 60_000)
    invalidarPorTabla('jugadores')
    expect(getCached('suelto')).toEqual('x')
  })

  // La segunda consulta tiene que volver a la base, no reusar el resultado que
  // ya se habia guardado.
  it('despues de invalidar se vuelve a consultar', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1')
    await cachedFetch('k', fetcher, 60_000, ['jugadores'])
    await cachedFetch('k', fetcher, 60_000, ['jugadores'])
    expect(fetcher).toHaveBeenCalledTimes(1)

    invalidarPorTabla('jugadores')
    await cachedFetch('k', fetcher, 60_000, ['jugadores'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

// El caso que hacía ver datos viejos aunque la pantalla se hubiera enterado del
// cambio: la consulta sale, el dato cambia mientras viaja, y al volver se
// guardaba igual. El siguiente que preguntaba recibía lo de antes del cambio.
describe('una consulta en vuelo cuando cambia la tabla', () => {
  it('no guarda el resultado viejo en el caché', async () => {
    let resolver: (v: string) => void = () => {}
    const enVuelo = new Promise<string>(r => { resolver = r })

    const pide = cachedFetch('k', () => enVuelo, 60_000, ['jugadores'])
    invalidarPorTabla('jugadores')   // el cambio llega antes de que vuelva
    resolver('viejo')
    await expect(pide).resolves.toBe('viejo')   // quien pidió recibe su respuesta

    expect(getCached('k')).toBeNull()            // pero no queda cacheada
  })

  it('la siguiente consulta trae el dato nuevo', async () => {
    let resolver: (v: string) => void = () => {}
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(r => { resolver = r }))
      .mockResolvedValueOnce('nuevo')

    const pide = cachedFetch('k', fetcher, 60_000, ['jugadores'])
    invalidarPorTabla('jugadores')
    resolver('viejo')
    await pide

    await expect(cachedFetch('k', fetcher, 60_000, ['jugadores'])).resolves.toBe('nuevo')
  })
})

describe('invalidate por clave', () => {
  it('sigue funcionando y limpia el registro de tablas', async () => {
    const fetcher = vi.fn().mockResolvedValue('v')
    await cachedFetch('asist:jugs:c1', fetcher, 60_000, ['jugadores'])

    invalidate('asist:jugs:c1')
    expect(getCached('asist:jugs:c1')).toBeNull()

    // Y tras volver a cargarla, invalidarPorTabla la sigue alcanzando.
    await cachedFetch('asist:jugs:c1', fetcher, 60_000, ['jugadores'])
    invalidarPorTabla('jugadores')
    expect(getCached('asist:jugs:c1')).toBeNull()
  })
})
