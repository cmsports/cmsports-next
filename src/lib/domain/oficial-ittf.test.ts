import { describe, expect, it } from 'vitest'
import {
  clasificarGrupoIttf,
  ganadorDesdeSets,
  parsearSetsTexto,
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
})

describe('ganadorDesdeSets / parsearSetsTexto', () => {
  it('parsea sets', () => {
    expect(parsearSetsTexto('11-6; 9-11; 11-8')).toEqual([[11, 6], [9, 11], [11, 8]])
  })

  it('detecta ganador bo5', () => {
    expect(ganadorDesdeSets('A', 'B', [[11, 4], [11, 6], [11, 2]], 3)).toBe('A')
  })
})
