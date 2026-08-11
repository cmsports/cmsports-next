import { describe, expect, it } from 'vitest'
import { construirLlavesLayoutNumerado } from './torneos'
import {
  aplicarModoSorteoLlave,
  aplicarSerpienteSegundos,
  aplicarSorteoSegundos,
  asignarNumerosIttf,
  posicionesSemillaIttf,
  resumenSiembraCuadro,
} from './oficial-sorteo'

describe('posicionesSemillaIttf / resumenSiembraCuadro', () => {
  it('semillas 8: 1 y 2 en mitades opuestas', () => {
    const pos = posicionesSemillaIttf(8)
    expect(pos[0]).toBe(0) // semilla 1 → slot 0
    expect(pos[1]).toBe(4) // semilla 2 → mitad inferior
  })

  it('resumen con 6 clasificados → llave 8 y 2 BYE', () => {
    const r = resumenSiembraCuadro(6)
    expect(r).not.toBeNull()
    expect(r!.tamanoLlave).toBe(8)
    expect(r!.byes).toBe(2)
    expect(r!.faseInicial).toBe('cuartos')
    expect(r!.previasViaGrupos).toBe(true)
  })
})

describe('sorteo 2ª fase', () => {
  it('sorteo_segundos no enfrenta mismo grupo', () => {
    const base = construirLlavesLayoutNumerado(4, [], [0, 1, 2, 3])
    expect(base.matches.length).toBeGreaterThan(0)
    let rngState = 1
    const rng = () => {
      rngState = (rngState * 16807) % 2147483647
      return (rngState - 1) / 2147483646
    }
    const out = aplicarSorteoSegundos(base, rng)
    for (const m of out.matches) {
      if (m.a && m.b) expect(m.a.grupoIdx).not.toBe(m.b.grupoIdx)
    }
  })

  it('serpiente reasigna 2.os sin mismo grupo', () => {
    const base = construirLlavesLayoutNumerado(4, [], [0, 1, 2, 3])
    const out = aplicarSerpienteSegundos(base)
    for (const m of out.matches) {
      if (m.a && m.b) expect(m.a.grupoIdx).not.toBe(m.b.grupoIdx)
    }
  })

  it('modo fijo deja el layout intacto', () => {
    const base = construirLlavesLayoutNumerado(4, [], [0, 1, 2, 3])
    const out = aplicarModoSorteoLlave('fijo', base, 4)
    expect(out).toEqual(base)
  })
})

describe('asignarNumerosIttf', () => {
  it('numera grupos antes que llaves, por orden', () => {
    const map = asignarNumerosIttf([
      { id: 'f1', fase: 'final', orden: 0 },
      { id: 'g2', fase: 'grupos', orden: 1, grupoOrden: 0 },
      { id: 'g1', fase: 'grupos', orden: 0, grupoOrden: 0 },
      { id: 'sf', fase: 'semis', orden: 0 },
    ])
    expect(map.get('g1')).toBe(1)
    expect(map.get('g2')).toBe(2)
    expect(map.get('sf')).toBe(3)
    expect(map.get('f1')).toBe(4)
  })
})
