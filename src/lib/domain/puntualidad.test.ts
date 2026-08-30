import { describe, expect, it } from 'vitest'
import { MOTIVO_MES_GRATIS, esMesGratis, etiquetaPuntualidad, resumenPuntualidad } from './puntualidad'

const enPlazo  = (mes: number) => ({ mes, anio: 2026, estado: 'pagado', puntualidad: 'a_tiempo' })
const atrasado = (mes: number) => ({ mes, anio: 2026, estado: 'pagado', puntualidad: 'atrasado' })
const sinMarca = (mes: number) => ({ mes, anio: 2026, estado: 'pagado', puntualidad: null })
const pendiente = (mes: number) => ({ mes, anio: 2026, estado: 'pendiente', puntualidad: null })
const gratis   = (mes: number) => ({ mes, anio: 2026, estado: 'exento', notas: MOTIVO_MES_GRATIS })

describe('esMesGratis', () => {
  it('distingue el premio de una exención cualquiera', () => {
    expect(esMesGratis(gratis(5))).toBe(true)
    expect(esMesGratis({ mes: 5, anio: 2026, estado: 'exento', notas: 'No vino este mes' })).toBe(false)
    expect(esMesGratis(enPlazo(5))).toBe(false)
    expect(esMesGratis(null)).toBe(false)
  })
})

describe('resumenPuntualidad', () => {
  it('cuenta cada tipo por separado', () => {
    const r = resumenPuntualidad([enPlazo(1), enPlazo(2), atrasado(3), sinMarca(4), gratis(5), pendiente(6)])
    expect(r).toEqual({ aTiempo: 2, atrasado: 1, sinMarcar: 1, mesesGratis: 1, racha: 0 })
  })

  it('la racha son los meses seguidos en plazo desde el más reciente', () => {
    expect(resumenPuntualidad([enPlazo(1), enPlazo(2), enPlazo(3)]).racha).toBe(3)
  })

  it('un atrasado la corta, y lo anterior no cuenta', () => {
    expect(resumenPuntualidad([enPlazo(1), enPlazo(2), atrasado(3), enPlazo(4)]).racha).toBe(1)
  })

  // Un mes que todavía no se cobró no es una falta: la racha se mide sobre lo
  // resuelto, no sobre lo que falta resolver.
  it('el mes pendiente no la corta', () => {
    expect(resumenPuntualidad([enPlazo(1), enPlazo(2), pendiente(3)]).racha).toBe(2)
  })

  // Cortarla sería absurdo: el mes gratis es el premio por la racha misma.
  it('el mes gratis no la corta', () => {
    expect(resumenPuntualidad([enPlazo(1), gratis(2), enPlazo(3)]).racha).toBe(2)
  })

  // Todo lo cobrado antes de la migración 234 está así, y no se puede suponer.
  it('un pago sin marcar no suma ni corta', () => {
    expect(resumenPuntualidad([enPlazo(1), sinMarca(2), enPlazo(3)]).racha).toBe(2)
    expect(resumenPuntualidad([sinMarca(1), sinMarca(2)]).racha).toBe(0)
  })

  it('no depende del orden en que lleguen las cuotas', () => {
    expect(resumenPuntualidad([atrasado(3), enPlazo(4), enPlazo(1)]).racha).toBe(1)
  })

  it('cruza el año', () => {
    const r = resumenPuntualidad([
      { mes: 12, anio: 2025, estado: 'pagado', puntualidad: 'a_tiempo' },
      { mes: 1,  anio: 2026, estado: 'pagado', puntualidad: 'a_tiempo' },
    ])
    expect(r.racha).toBe(2)
  })

  it('sin historial no inventa nada', () => {
    expect(resumenPuntualidad([])).toEqual({ aTiempo: 0, atrasado: 0, sinMarcar: 0, mesesGratis: 0, racha: 0 })
  })
})

describe('etiquetaPuntualidad', () => {
  it('solo etiqueta lo que está resuelto', () => {
    expect(etiquetaPuntualidad(enPlazo(1))).toBe('🟢 En plazo')
    expect(etiquetaPuntualidad(atrasado(1))).toBe('🔴 Atrasado')
    expect(etiquetaPuntualidad(sinMarca(1))).toBe('⚪ Sin marcar')
    expect(etiquetaPuntualidad(gratis(1))).toBe('🎁 Mes gratis')
    expect(etiquetaPuntualidad(pendiente(1))).toBeNull()
    expect(etiquetaPuntualidad(null)).toBeNull()
  })
})
