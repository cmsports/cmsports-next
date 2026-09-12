import { describe, expect, it } from 'vitest'
import { parsearProgramacionJornada, programarJornadaDivision, type PartidoPendiente } from './ligaJornadas'
import { generarFixtureDivision } from './liga'
import { TEXTO_JORNADA_1 } from './ligaJornadas.jornada1.fixture'

// La liga completa de Spinhouse tal como se arma en producción: la Jornada 1
// la pegó el club de su hoja y desde ahí sigue el motor, división por
// división, con las mesas de cada una. Lo que se congela acá es en cuántas
// jornadas termina cada división y que no queden colas de uno o dos
// partidos: el 2026-09-12 la Honor salía 15+14+14+2 y la Primera
// 18+18+17+13, con un motor que se rendía a los 12 intentos.
function jornadasDeLaDivision(nombre: string): number[] {
  const prog = parsearProgramacionJornada(TEXTO_JORNADA_1, 2026)
  const div = prog.dias.flatMap(d => d.divisiones).find(x => x.nombre === nombre)!
  // Mismo orden que la importación: nombres como aparecen (A, B, árbitro) y el
  // fixture del módulo de liga.
  const nombres = [...new Set(div.filas.flatMap(f => [f.jugadorA, f.jugadorB, f.arbitro ?? '']))].filter(Boolean)
  const jugadas = new Set(div.filas.map(f => [f.jugadorA, f.jugadorB].sort().join('|')))
  let quedan: PartidoPendiente[] = generarFixtureDivision(nombres)
    .filter(p => !jugadas.has([p.jugadorA, p.jugadorB].sort().join('|')))
    .map(p => ({ id: `${p.jugadorA}|${p.jugadorB}`, jugadorAId: p.jugadorA, jugadorBId: p.jugadorB }))
  const tam: number[] = [div.filas.length]
  while (quedan.length && tam.length < 12) {
    const { partidos } = programarJornadaDivision({ pendientes: quedan, jugadorIds: nombres, porJugador: 3, mesas: div.mesas })
    if (!partidos.length) break
    const usados = new Set(partidos.map(p => p.id))
    quedan = quedan.filter(p => !usados.has(p.id))
    tam.push(partidos.length)
  }
  expect(quedan).toHaveLength(0)
  return tam
}

describe('la liga de Spinhouse, división por división, desde su Jornada 1 real', () => {
  it('División de Honor (10): 45 partidos en 3 jornadas llenas', () => {
    expect(jornadasDeLaDivision('División de Honor')).toEqual([15, 15, 15])
  })

  it('Primera División (12): 66 partidos en 4 jornadas', () => {
    expect(jornadasDeLaDivision('Primera División')).toEqual([18, 18, 18, 12])
  })

  it('Segunda División (14): 91 partidos en 5 jornadas', () => {
    const tam = jornadasDeLaDivision('Segunda División')
    expect(tam.reduce((a, b) => a + b, 0)).toBe(91)
    expect(tam).toHaveLength(5)
  })

  it('Tercera División (15): 105 partidos en 5 jornadas', () => {
    const tam = jornadasDeLaDivision('Tercera División')
    expect(tam.reduce((a, b) => a + b, 0)).toBe(105)
    expect(tam).toHaveLength(5)
  })
})
