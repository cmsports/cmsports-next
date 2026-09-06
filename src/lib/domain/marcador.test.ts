import { describe, it, expect } from 'vitest'
import { esSetValido, resumirBo5, esResultadoBo5Valido, determinarGanadorBo5, setsParaGanar, setsMaximos, marcadoresValidos, esResultadoValido, resumirPartido, marcadoresPermitidosTexto, formatoDe } from './marcador'

describe('esSetValido', () => {
  it('acepta un set normal ganado a 11', () => {
    expect(esSetValido(11, 9)).toBe(true)
    expect(esSetValido(11, 0)).toBe(true)
    expect(esSetValido(4, 11)).toBe(true)
  })

  it('rechaza un set cerrado antes de 11', () => {
    expect(esSetValido(10, 8)).toBe(false)
    expect(esSetValido(9, 2)).toBe(false)
  })

  it('desde 10 iguales exige dos de ventaja', () => {
    expect(esSetValido(11, 10)).toBe(false)
    expect(esSetValido(12, 10)).toBe(true)
    expect(esSetValido(13, 11)).toBe(true)
    expect(esSetValido(13, 10)).toBe(false)
    expect(esSetValido(20, 18)).toBe(true)
  })

  it('rechaza empates, negativos y decimales', () => {
    expect(esSetValido(11, 11)).toBe(false)
    expect(esSetValido(11, -1)).toBe(false)
    expect(esSetValido(11.5, 9)).toBe(false)
  })
})

describe('resumirBo5', () => {
  it('suma sets y puntos de un 3-0', () => {
    expect(resumirBo5([[11, 9], [11, 7], [11, 5]])).toEqual({ setsA: 3, setsB: 0, puntosA: 33, puntosB: 21 })
  })

  it('suma sets y puntos de un 3-2 con deuce', () => {
    expect(resumirBo5([[11, 9], [9, 11], [12, 10], [8, 11], [11, 6]]))
      .toEqual({ setsA: 3, setsB: 2, puntosA: 51, puntosB: 47 })
  })

  it('rechaza un partido sin terminar', () => {
    expect(resumirBo5([[11, 9], [11, 7]])).toBeNull()
    expect(resumirBo5([[11, 9], [9, 11], [11, 7], [8, 11]])).toBeNull()
  })

  it('rechaza un set jugado después de que el partido terminó', () => {
    expect(resumirBo5([[11, 9], [11, 7], [11, 5], [11, 4]])).toBeNull()
  })

  it('rechaza un set inválido aunque el partido cierre', () => {
    expect(resumirBo5([[11, 9], [11, 7], [10, 8]])).toBeNull()
  })

  it('rechaza más de 5 sets', () => {
    expect(resumirBo5([[11, 9], [9, 11], [11, 9], [9, 11], [11, 9], [11, 9]])).toBeNull()
  })

  it('coincide con la validación de sets que ya usaba Liga', () => {
    const r = resumirBo5([[11, 9], [9, 11], [11, 7], [11, 6]])!
    expect(esResultadoBo5Valido(r.setsA, r.setsB)).toBe(true)
    expect(determinarGanadorBo5(r.setsA, r.setsB, 'ana', 'beto')).toBe('ana')
  })
})

describe('formatos: mejor de 3 y mejor de 5', () => {
  it('el mejor de 3 se gana con 2 sets y el de 5 con 3', () => {
    expect(setsParaGanar('bo3')).toBe(2)
    expect(setsParaGanar('bo5')).toBe(3)
    expect(setsMaximos('bo3')).toBe(3)
    expect(setsMaximos('bo5')).toBe(5)
  })

  it('los marcadores válidos del mejor de 3 son cuatro', () => {
    expect(marcadoresValidos('bo3').map(([a, b]) => `${a}-${b}`))
      .toEqual(['2-0', '2-1', '0-2', '1-2'])
  })

  it('y los del mejor de 5 siguen siendo los seis de siempre', () => {
    expect(marcadoresValidos('bo5').map(([a, b]) => `${a}-${b}`))
      .toEqual(['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'])
  })

  it('un 3-1 no es un resultado válido al mejor de 3', () => {
    expect(esResultadoValido(3, 1, 'bo3')).toBe(false)
    expect(esResultadoValido(2, 1, 'bo3')).toBe(true)
    // Y al revés: un 2-1 no cierra un partido al mejor de 5.
    expect(esResultadoValido(2, 1, 'bo5')).toBe(false)
  })

  it('resume un mejor de 3 de dos sets', () => {
    expect(resumirPartido([[11, 9], [11, 7]], 'bo3'))
      .toEqual({ setsA: 2, setsB: 0, puntosA: 22, puntosB: 16 })
  })

  it('resume un mejor de 3 que se fue al tercer set', () => {
    expect(resumirPartido([[11, 9], [8, 11], [12, 10]], 'bo3'))
      .toEqual({ setsA: 2, setsB: 1, puntosA: 31, puntosB: 30 })
  })

  it('no acepta un cuarto set en un mejor de 3', () => {
    expect(resumirPartido([[11, 9], [8, 11], [11, 5], [11, 6]], 'bo3')).toBeNull()
  })

  it('no acepta un partido a medio jugar', () => {
    expect(resumirPartido([[11, 9]], 'bo3')).toBeNull()
    expect(resumirPartido([[11, 9], [11, 7]], 'bo5')).toBeNull()
  })

  it('el texto del error nombra los marcadores de ese formato', () => {
    expect(marcadoresPermitidosTexto('bo3')).toContain('Mejor de 3')
    expect(marcadoresPermitidosTexto('bo3')).toContain('2-1')
    expect(marcadoresPermitidosTexto('bo3')).not.toContain('3-1')
  })

  it('lo que venga de la base se normaliza, y lo desconocido cae en bo5', () => {
    expect(formatoDe('bo3')).toBe('bo3')
    expect(formatoDe(null)).toBe('bo5')
    expect(formatoDe('bo7')).toBe('bo5')
  })
})
