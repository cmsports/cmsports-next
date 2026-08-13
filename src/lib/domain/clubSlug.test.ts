import { describe, expect, it } from 'vitest'
import { CLUB_ID_BUIN, clubIdDesdeParametro, pathCanonicoMiAcceso, pathMiAcceso } from './clubSlug'

describe('link público de credenciales', () => {
  it('buin resuelve al club y el path que se copia es corto', () => {
    expect(clubIdDesdeParametro('buin')).toBe(CLUB_ID_BUIN)
    expect(clubIdDesdeParametro('Buin')).toBe(CLUB_ID_BUIN)
    expect(pathMiAcceso(CLUB_ID_BUIN)).toBe('/mi-acceso/buin')
  })

  it('el UUID viejo sigue sirviendo y se canónica al slug', () => {
    expect(clubIdDesdeParametro(CLUB_ID_BUIN)).toBe(CLUB_ID_BUIN)
    expect(pathCanonicoMiAcceso(`/mi-acceso/${CLUB_ID_BUIN}`)).toBe('/mi-acceso/buin')
    expect(pathCanonicoMiAcceso('/mi-acceso/buin')).toBe('/mi-acceso/buin')
  })

  it('un club sin slug sigue con el UUID', () => {
    const otro = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(pathMiAcceso(otro)).toBe(`/mi-acceso/${otro}`)
    expect(pathCanonicoMiAcceso(`/mi-acceso/${otro}`)).toBe(`/mi-acceso/${otro}`)
  })

  it('basura no se manda al RPC como si fuera un club', () => {
    expect(clubIdDesdeParametro('no-existe')).toBeNull()
    expect(pathCanonicoMiAcceso('/mi-acceso/no-existe')).toBeNull()
    expect(pathCanonicoMiAcceso('/credenciales')).toBeNull()
  })
})
