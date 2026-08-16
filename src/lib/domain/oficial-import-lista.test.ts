import { describe, expect, it } from 'vitest'
import { elegirMejorHojaLista, parsearListaOficial } from './oficial-import-lista'

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
    expect(r.filas[0].asociacion).toBe('BUI')
  })

  it('omite duplicados', () => {
    const r = parsearListaOficial('nombre\nAna\nAna')
    expect(r.filas).toHaveLength(1)
    expect(r.errores[0]).toMatch(/duplicado/)
  })

  it('salta fila de título y reconoce encabezados con acento y texto extra', () => {
    const r = parsearListaOficial(
      'LISTA DE INSCRITOS MET2 COSTA\nNombre del jugador;Asociación;FCTM ID;Ranking\nCAMPOS Julian;SMG;601;12',
    )
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toEqual({
      nombre: 'CAMPOS Julian',
      asociacion: 'SMG',
      codigoFederativo: '601',
      ranking: 12,
    })
    expect(r.columnas.nombre).toMatch(/nombre/i)
  })

  it('junta apellido + nombre en columnas separadas', () => {
    const r = parsearListaOficial('Apellido,Nombre,Club\nGONZALEZ,Agustin,CRD')
    expect(r.filas[0].nombre).toBe('GONZALEZ Agustin')
    expect(r.filas[0].asociacion).toBe('CRD')
  })

  it('ignora columnas de más (teléfono, mail) y toma ID', () => {
    const r = parsearListaOficial(
      'nro,player name,club,phone,id,email\n1,Ana Perez,BUI,91111111,4488,ana@x.cl',
    )
    expect(r.filas[0].nombre).toBe('Ana Perez')
    expect(r.filas[0].asociacion).toBe('BUI')
    expect(r.filas[0].codigoFederativo).toBe('4488')
  })

  it('elige la hoja Players entre varias pestañas', () => {
    const r = elegirMejorHojaLista([
      { nombre: 'Portada', csv: 'MET2 Costa\nSábado 22' },
      { nombre: 'Players', csv: 'NAME,ASSOCIATION,COD\nPEREA Mariano,SMG,601' },
      { nombre: 'Prog', csv: 'hora,mesa\n10:00,1' },
    ])
    expect(r?.nombre).toBe('Players')
    expect(parsearListaOficial(r!.csv).filas[0].nombre).toBe('PEREA Mariano')
  })
})
