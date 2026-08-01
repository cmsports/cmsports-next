import { describe, expect, it } from 'vitest'
import { calcularRankingInterno, puntosPorFase } from './rankingInterno'

describe('puntosPorFase', () => {
  it('duplica por ronda: avance=1, 32vos=1... hasta final=32', () => {
    expect(puntosPorFase('avance')).toBe(1)
    expect(puntosPorFase('32vos')).toBe(2)
    expect(puntosPorFase('16vos')).toBe(4)
    expect(puntosPorFase('8vos')).toBe(8)
    expect(puntosPorFase('cuartos')).toBe(16)
    expect(puntosPorFase('semis')).toBe(32)
    expect(puntosPorFase('final')).toBe(64)
  })

  // Un partido viejo o corrupto sin fase reconocida no debería borrar la
  // victoria del jugador: el mínimo, no cero.
  it('fase desconocida o nula da el mínimo, no cero', () => {
    expect(puntosPorFase(null)).toBe(1)
    expect(puntosPorFase('')).toBe(1)
    expect(puntosPorFase('grupos')).toBe(1)
  })
})

describe('calcularRankingInterno', () => {
  const nombreDe = (id: string) => ({ a: 'Ana', b: 'Beto', c: 'Cami', d: 'Dario' }[id] ?? id)

  it('avanzar rondas pesa más que acumular victorias en primera ronda', () => {
    // Ana gana un solo partido, pero en semifinal: 32 pts.
    // Beto gana tres partidos de 'avance' en tres torneos chicos: 1+1+1=3 pts.
    const partidos = [
      { jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'semis' },
      { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: 'avance' },
      { jugador_a: 'b', jugador_b: 'z', ganador: 'b', fase: 'avance' },
      { jugador_a: 'b', jugador_b: 'w', ganador: 'b', fase: 'avance' },
    ]
    const r = calcularRankingInterno(partidos, nombreDe)
    const ana = r.find(f => f.jugadorId === 'a')!
    const beto = r.find(f => f.jugadorId === 'b')!
    expect(ana.pts).toBe(32)
    expect(beto.pts).toBe(3)
    expect(ana.rank).toBeLessThan(beto.rank)
  })

  it('perder no resta puntos: jugar más torneos nunca baja a nadie', () => {
    const partidos = [
      { jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'avance' },
      { jugador_a: 'a', jugador_b: 'c', ganador: 'c', fase: 'avance' },
      { jugador_a: 'a', jugador_b: 'd', ganador: 'd', fase: 'avance' },
    ]
    const r = calcularRankingInterno(partidos, nombreDe)
    const ana = r.find(f => f.jugadorId === 'a')!
    expect(ana.pts).toBe(1)      // la única victoria, nada se descuenta
    expect(ana.derrotas).toBe(2)
  })

  it('dos jugadores con los mismos puntos comparten puesto: 1, 1, 3', () => {
    const partidos = [
      { jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'cuartos' },
      { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: 'cuartos' },
      { jugador_a: 'c', jugador_b: 'z', ganador: 'c', fase: 'avance' },
    ]
    const r = calcularRankingInterno(partidos, nombreDe)
    const [p1, p2, p3] = r
    expect(p1.pts).toBe(16); expect(p2.pts).toBe(16); expect(p3.pts).toBe(1)
    expect(p1.rank).toBe(1)
    expect(p2.rank).toBe(1)
    expect(p3.rank).toBe(3)   // salta el 2, como en cualquier ranking deportivo
  })

  it('con los mismos puntos, más victorias ordena primero (aunque el rank sea igual)', () => {
    const partidos = [
      { jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'cuartos' },
      { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: 'cuartos' },
      { jugador_a: 'b', jugador_b: 'w', ganador: 'w', fase: 'avance' },   // beto suma una derrota más
    ]
    const r = calcularRankingInterno(partidos, nombreDe)
    expect(r[0].jugadorId).toBe('a')   // menos derrotas, va primero en la lista
    expect(r[0].rank).toBe(r[1].rank)  // pero comparten puesto: mismos puntos
  })

  it('sin partidos no revienta: devuelve una lista vacía', () => {
    expect(calcularRankingInterno([], nombreDe)).toEqual([])
  })

  // Un ganador que no coincide con ninguno de los dos jugadores del partido es
  // un dato mal cargado. No debe reventar el cálculo de todos los demás.
  it('un partido con ganador inconsistente se ignora sin romper el resto', () => {
    const partidos = [
      { jugador_a: 'a', jugador_b: 'b', ganador: 'otro-id', fase: 'final' },
      { jugador_a: 'c', jugador_b: 'd', ganador: 'c', fase: 'avance' },
    ]
    const r = calcularRankingInterno(partidos, nombreDe)
    const cami = r.find(f => f.jugadorId === 'c')!
    expect(cami.pts).toBe(1)
    // a y b figuran igual (jugaron), solo que sin puntos ni resultado.
    const ana = r.find(f => f.jugadorId === 'a')!
    expect(ana.pts).toBe(0)
    expect(ana.victorias).toBe(0)
    expect(ana.derrotas).toBe(0)
  })
})
