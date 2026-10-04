import { describe, expect, it } from 'vitest'
import { celdaCsv, COLUMNAS_PARTIDOS, fechaConOffset, serializarPartidos, type ExportacionPartidos, type PartidoExportable } from './exportacionPartidos'

describe('exportación de partidos', () => {
  it('escapa comillas, comas y líneas nuevas según RFC 4180, conservando español', () => {
    expect(celdaCsv('José, "Muñoz"\nPérez')).toBe('"José, ""Muñoz""\nPérez"')
    expect(celdaCsv(null)).toBe('""')
    expect(celdaCsv([[11, 9], [11, 7]])).toBe('"[[11,9],[11,7]]"')
  })

  it('neutraliza fórmulas de hojas de cálculo también tras espacios y caracteres invisibles', () => {
    for (const nombre of ['=HYPERLINK("https://ejemplo.cl")', '+SUM(1)', '-SUM(1)', '@SUM(1)', ' \t=1', '\u200b=1', '\tHola']) {
      expect(celdaCsv(nombre).startsWith('"\'')).toBe(true)
    }
    expect(celdaCsv('María José')).toBe('"María José"')
  })

  it('exporta CSV con BOM UTF-8 y JSON versionado sin alterar nombres ni null', () => {
    const partido = Object.fromEntries(COLUMNAS_PARTIDOS.map(k => [k, null])) as unknown as PartidoExportable
    partido.id = 'p1'
    partido.jugador_a_nombre = '=Malicioso'
    partido.es_walkover = false
    partido.estado = 'pendiente'
    const datos: ExportacionPartidos = {
      version: 1, fecha_exportacion: '2026-10-03',
      competencia: { tipo: 'torneo', id: 't1', nombre: 'Copa Ñuñoa', modalidad: 'grupos', fecha_inicio: null, fecha_fin: null },
      partidos: [partido],
    }
    const csv = serializarPartidos(datos, 'csv')
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv).toContain('"\'=Malicioso"')
    expect(csv).toContain('Copa Ñuñoa')
    const json = JSON.parse(serializarPartidos(datos, 'json'))
    expect(json).toEqual(datos)
    expect(json.partidos[0].parciales).toBeNull()
  })

  it('calcula el domingo de una jornada sin perder el día por UTC/DST ni cambio de mes', () => {
    expect(fechaConOffset('2026-09-12', 1)).toBe('2026-09-13')
    expect(fechaConOffset('2026-12-31', 1)).toBe('2027-01-01')
    expect(fechaConOffset(null, 1)).toBeNull()
  })
})
