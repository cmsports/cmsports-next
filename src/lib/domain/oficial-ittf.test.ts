import { describe, expect, it } from 'vitest'
import {
  clasificarGrupoIttf,
  completarSetsRetiro,
  ganadorDesdeSets,
  ordenPartidosGrupoIttf,
  parsearSetsTexto,
  resolverCierrePartido,
  setsSinteticosWalkover,
  type PartidoOficialStats,
} from './oficial-ittf'

describe('clasificarGrupoIttf', () => {
  it('otorga 2 al ganador y 1 al perdedor de partido jugado', () => {
    const partidos: PartidoOficialStats[] = [
      { inscritoA: 'A', inscritoB: 'B', ganador: 'A', sets: [[11, 5], [11, 3], [11, 7]] },
      { inscritoA: 'A', inscritoB: 'C', ganador: 'A', sets: [[11, 4], [11, 6], [11, 2]] },
      { inscritoA: 'B', inscritoB: 'C', ganador: 'B', sets: [[11, 8], [11, 9], [11, 5]] },
    ]
    const stats = clasificarGrupoIttf(['A', 'B', 'C'], partidos)
    expect(stats.map(s => s.inscritoId)).toEqual(['A', 'B', 'C'])
    expect(stats[0].pts).toBe(4)
    expect(stats[1].pts).toBe(3)
    expect(stats[2].pts).toBe(2)
  })

  it('W.O. da 0 al perdedor en ese partido', () => {
    const partidos: PartidoOficialStats[] = [
      { inscritoA: 'A', inscritoB: 'B', ganador: 'A', esWalkover: true },
    ]
    const stats = clasificarGrupoIttf(['A', 'B'], partidos)
    expect(stats.find(s => s.inscritoId === 'A')?.pts).toBe(2)
    expect(stats.find(s => s.inscritoId === 'B')?.pts).toBe(0)
  })

  it('retiro con sets parciales da 0 pts al perdedor y cuenta juegos jugados', () => {
    const partidos: PartidoOficialStats[] = [
      {
        inscritoA: 'A',
        inscritoB: 'B',
        ganador: 'A',
        esWalkover: true,
        tipoCierre: 'retiro',
        sets: [[11, 9], [9, 11], [11, 0], [11, 0]],
      },
    ]
    const stats = clasificarGrupoIttf(['A', 'B'], partidos)
    expect(stats.find(s => s.inscritoId === 'B')?.pts).toBe(0)
    expect(stats.find(s => s.inscritoId === 'A')?.juegosGanados).toBe(3)
    expect(stats.find(s => s.inscritoId === 'B')?.juegosGanados).toBe(1)
  })
})

describe('ganadorDesdeSets / parsearSetsTexto', () => {
  it('parsea sets', () => {
    expect(parsearSetsTexto('11-6; 9-11; 11-8')).toEqual([[11, 6], [9, 11], [11, 8]])
  })

  it('detecta ganador bo5', () => {
    expect(ganadorDesdeSets('A', 'B', [[11, 4], [11, 6], [11, 2]], 3)).toBe('A')
  })
})

describe('resolverCierrePartido', () => {
  it('W.O. genera 3×11-0 sintéticos en bo5', () => {
    const r = resolverCierrePartido({
      inscritoA: 'A',
      inscritoB: 'B',
      tipoCierre: 'walkover',
      ganadorId: 'A',
      gamesParaGanar: 3,
    })
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.sets).toEqual([[11, 0], [11, 0], [11, 0]])
    expect(r.esIncompleto).toBe(true)
  })

  it('retiro conserva parciales y completa', () => {
    const r = resolverCierrePartido({
      inscritoA: 'A',
      inscritoB: 'B',
      tipoCierre: 'retiro',
      ganadorId: 'B',
      sets: [[11, 5], [8, 11]],
      gamesParaGanar: 3,
    })
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.sets).toEqual([[11, 5], [8, 11], [0, 11], [0, 11]])
    expect(r.tipoCierre).toBe('retiro')
  })

  it('W.O. con sets parciales se trata como retiro', () => {
    const r = resolverCierrePartido({
      inscritoA: 'A',
      inscritoB: 'B',
      tipoCierre: 'walkover',
      ganadorId: 'A',
      sets: [[11, 9]],
      gamesParaGanar: 3,
    })
    if ('error' in r) throw new Error(r.error)
    expect(r.tipoCierre).toBe('retiro')
    expect(r.sets[0]).toEqual([11, 9])
  })
})

describe('setsSinteticosWalkover / completarSetsRetiro', () => {
  it('sintetiza a favor de B', () => {
    expect(setsSinteticosWalkover(false, 2)).toEqual([[0, 11], [0, 11]])
  })

  it('completa retiro desde 0-0', () => {
    expect(completarSetsRetiro([], true, 3)).toEqual([[11, 0], [11, 0], [11, 0]])
  })
})

describe('ordenPartidosGrupoIttf', () => {
  it('grupo de 3: 1-3, 2-3, 1-2', () => {
    expect(ordenPartidosGrupoIttf(['1', '2', '3'])).toEqual([
      ['1', '3'],
      ['2', '3'],
      ['1', '2'],
    ])
  })

  it('grupo de 4: secuencia Koidan/Excel', () => {
    expect(ordenPartidosGrupoIttf(['1', '2', '3', '4'])).toEqual([
      ['1', '3'],
      ['2', '4'],
      ['1', '2'],
      ['3', '4'],
      ['1', '4'],
      ['2', '3'],
    ])
  })
})
