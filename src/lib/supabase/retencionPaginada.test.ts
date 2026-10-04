import { describe, expect, it } from 'vitest'
import { leerRetencionPaginada } from './retencionPaginada'

describe('retención no se limita a la primera página de asistencia', () => {
  it('incluye marcas de páginas posteriores y no repite bordes', async () => {
    const filas = Array.from({ length: 2401 }, (_, id) => ({ id }))
    const rangos: number[] = []
    const resultado = await leerRetencionPaginada(async (desde, hasta) => {
      rangos.push(desde)
      return { data: filas.slice(desde, hasta + 1), error: null }
    })
    expect(resultado.data).toEqual(filas)
    expect(rangos).toEqual([0, 1000, 2000])
  })
  it('una segunda página fallida aborta la revisión completa', async () => {
    await expect(leerRetencionPaginada(async desde => desde === 0
      ? { data: [1, 2], error: null }
      : { data: null, error: { message: 'Lectura incompleta' } }, 2)).rejects.toThrow('Lectura incompleta')
  })
})
