import { describe, expect, it } from 'vitest'
import { parsearListaOficial } from './oficial-import-lista'

describe('parsearListaOficial', () => {
  it('parsea CSV con encabezado', () => {
    const r = parsearListaOficial('nombre,asociacion,codigo,ranking\nCAMPOS Julian,SMG,601,12\nGONZALEZ Agustin,CRD,602,')
    expect(r.filas).toHaveLength(2)
    expect(r.filas[0]).toEqual({
      nombre: 'CAMPOS Julian',
      asociacion: 'SMG',
      codigoFederativo: '601',
      ranking: 12,
    })
    expect(r.filas[1].ranking).toBeUndefined()
  })

  it('parsea TSV estilo hoja Players (COD = asociación si ASSOCIATION vacío)', () => {
    const r = parsearListaOficial('NAME\tASSOCIATION\tCOD\nPEREA, Mariano\t\tSMG')
    expect(r.filas[0].nombre).toBe('PEREA, Mariano')
    expect(r.filas[0].asociacion).toBe('SMG')
  })

  it('sin encabezado usa col0=nombre col1=asociacion', () => {
    const r = parsearListaOficial('Ana Perez,BUI\nLuis Soto,PAI')
    expect(r.filas.map(f => f.nombre)).toEqual(['Ana Perez', 'Luis Soto'])
  })

  it('omite duplicados', () => {
    const r = parsearListaOficial('nombre\nAna\nAna')
    expect(r.filas).toHaveLength(1)
    expect(r.errores[0]).toMatch(/duplicado/)
  })
})
