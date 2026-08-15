import { describe, expect, it } from 'vitest'
import { calcularRankingInterno, faltaParaSubir, type TorneoConPartidos } from './rankingInterno'

const nombreDe = (id: string) => ({ a: 'Ana', b: 'Beto', c: 'Cami', d: 'Dario' }[id] ?? id)

/** Un torneo mínimo con final jugada, para no repetir el armado en cada caso. */
function torneo(torneoId: string, partidos: TorneoConPartidos['partidos']): TorneoConPartidos {
  return { torneoId, partidos }
}

describe('calcularRankingInterno', () => {
  it('paga por el puesto final, no por cuántos partidos ganó', () => {
    // Ana sale campeona de un torneo: 100.
    // Beto gana tres partidos de primera ronda en tres torneos, pero cae en
    // 8vos cada vez: 20 + 20 + 20 = 60. Menos que un solo título.
    const r = calcularRankingInterno([
      torneo('t1', [{ jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'final' }]),
      torneo('t2', [
        { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: '16vos' },
        { jugador_a: 'b', jugador_b: 'z', ganador: 'z', fase: '8vos' },
      ]),
      torneo('t3', [
        { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: '16vos' },
        { jugador_a: 'b', jugador_b: 'z', ganador: 'z', fase: '8vos' },
      ]),
      torneo('t4', [
        { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: '16vos' },
        { jugador_a: 'b', jugador_b: 'z', ganador: 'z', fase: '8vos' },
      ]),
    ], nombreDe)

    expect(r.find(f => f.jugadorId === 'a')!.pts).toBe(100)
    expect(r.find(f => f.jugadorId === 'b')!.pts).toBe(60)
    expect(r.find(f => f.jugadorId === 'a')!.rank).toBeLessThan(r.find(f => f.jugadorId === 'b')!.rank)
  })

  it('acumula entre torneos de la categoría', () => {
    // Campeona en uno (100) y finalista en otro (90).
    const r = calcularRankingInterno([
      torneo('t1', [{ jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'final' }]),
      torneo('t2', [{ jugador_a: 'a', jugador_b: 'y', ganador: 'y', fase: 'final' }]),
    ], nombreDe)

    const ana = r.find(f => f.jugadorId === 'a')!
    expect(ana.pts).toBe(190)
    expect(ana.torneos).toBe(2)
  })

  it('participar sin pasar de grupos igual suma', () => {
    const r = calcularRankingInterno([
      torneo('t1', [
        { jugador_a: 'c', jugador_b: 'd', ganador: 'c', fase: 'grupos' },
        { jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' },
      ]),
    ], nombreDe)

    // Ni Cami ni Dario llegaron a la llave: 9 cada uno.
    expect(r.find(f => f.jugadorId === 'c')!.pts).toBe(9)
    expect(r.find(f => f.jugadorId === 'd')!.pts).toBe(9)
  })

  it('perder no resta: jugar más torneos nunca baja a nadie', () => {
    const soloUno = calcularRankingInterno([
      torneo('t1', [{ jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'final' }]),
    ], nombreDe).find(f => f.jugadorId === 'a')!

    const conOtroMalo = calcularRankingInterno([
      torneo('t1', [{ jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'final' }]),
      torneo('t2', [{ jugador_a: 'a', jugador_b: 'y', ganador: 'y', fase: 'grupos' }]),
    ], nombreDe).find(f => f.jugadorId === 'a')!

    expect(conOtroMalo.pts).toBeGreaterThan(soloUno.pts)
  })

  it('dos con los mismos puntos comparten puesto: 1, 1, 3', () => {
    const r = calcularRankingInterno([
      torneo('t1', [
        { jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'semis' },
        { jugador_a: 'b', jugador_b: 'y', ganador: 'b', fase: 'semis' },
        { jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' },
        { jugador_a: 'c', jugador_b: 'z', ganador: 'z', fase: 'cuartos' },
      ]),
    ], nombreDe)

    // x e y perdieron en semis: 80 los dos, mismo puesto.
    const px = r.find(f => f.jugadorId === 'x')!
    const py = r.find(f => f.jugadorId === 'y')!
    expect(px.pts).toBe(80)
    expect(py.pts).toBe(80)
    expect(px.rank).toBe(py.rank)
  })

  it('sin torneos no revienta: devuelve una lista vacía', () => {
    expect(calcularRankingInterno([], nombreDe)).toEqual([])
  })

  it('un partido con ganador inconsistente no rompe el resto', () => {
    const r = calcularRankingInterno([
      torneo('t1', [
        { jugador_a: 'a', jugador_b: 'b', ganador: 'otro-id', fase: 'final' },
        { jugador_a: 'c', jugador_b: 'd', ganador: 'c', fase: 'grupos' },
      ]),
    ], nombreDe)

    // Cami se fue en grupos igual: participó.
    expect(r.find(f => f.jugadorId === 'c')!.pts).toBe(9)
    // A y B jugaron la final pero nadie la ganó según el dato: ninguno es
    // campeón, los dos quedan como finalistas perdedores.
    const ana = r.find(f => f.jugadorId === 'a')!
    expect(ana.victorias).toBe(0)
    expect(ana.derrotas).toBe(0)
    expect(ana.pts).toBe(90)
  })

  it('las victorias y derrotas se siguen contando aunque no den puntos', () => {
    const r = calcularRankingInterno([
      torneo('t1', [
        { jugador_a: 'a', jugador_b: 'x', ganador: 'a', fase: 'cuartos' },
        { jugador_a: 'a', jugador_b: 'y', ganador: 'a', fase: 'semis' },
        { jugador_a: 'a', jugador_b: 'z', ganador: 'z', fase: 'final' },
      ]),
    ], nombreDe)

    const ana = r.find(f => f.jugadorId === 'a')!
    expect(ana.victorias).toBe(2)
    expect(ana.derrotas).toBe(1)
    expect(ana.jugados).toBe(3)
    expect(ana.pts).toBe(90)   // perdió la final
  })

  describe('saldo inicial del ranking en papel', () => {
    it('se suma a lo que gane en los torneos del sistema', () => {
      const r = calcularRankingInterno(
        [torneo('t1', [{ jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' }])],
        nombreDe,
        new Map([['a', 240]]),
      )
      expect(r.find(f => f.jugadorId === 'a')!.pts).toBe(340)  // 240 traídos + 100 del título
      expect(r.find(f => f.jugadorId === 'b')!.pts).toBe(90)   // sin saldo, solo lo suyo
    })

    it('quien solo tiene saldo aparece igual en la tabla', () => {
      // Es su posición de hoy: todavía no jugó ningún torneo en el sistema.
      const r = calcularRankingInterno([], nombreDe, new Map([['c', 400]]))
      expect(r).toHaveLength(1)
      expect(r[0]).toMatchObject({ jugadorId: 'c', nombre: 'Cami', pts: 400, rank: 1, torneos: 0, jugados: 0 })
    })

    it('el saldo no cuenta como torneo jugado', () => {
      const r = calcularRankingInterno(
        [torneo('t1', [{ jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' }])],
        nombreDe,
        new Map([['a', 50]]),
      )
      expect(r.find(f => f.jugadorId === 'a')!.torneos).toBe(1)
    })

    it('el saldo ordena la tabla como cualquier punto', () => {
      // Beto ganó el único torneo, pero Ana llega con más arrastre: va primera.
      const r = calcularRankingInterno(
        [torneo('t1', [{ jugador_a: 'b', jugador_b: 'd', ganador: 'b', fase: 'final' }])],
        nombreDe,
        new Map([['a', 400]]),
      )
      expect(r[0].jugadorId).toBe('a')
      expect(r[0].rank).toBe(1)
      expect(r[1].jugadorId).toBe('b')
    })

    it('sin saldo se comporta igual que antes', () => {
      const partidos = [torneo('t1', [{ jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' }])]
      expect(calcularRankingInterno(partidos, nombreDe))
        .toEqual(calcularRankingInterno(partidos, nombreDe, new Map()))
    })
  })
})

describe('faltaParaSubir', () => {
  // La tabla siempre llega ordenada de mayor a menor, como la devuelve
  // calcularRankingInterno.
  const tabla = [190, 180, 120, 110, 100, 100, 100, 90, 89, 89, 80].map(pts => ({ pts }))

  it('mide contra el de ARRIBA, no contra el que va ganando', () => {
    // El caso que estaba mal: con 89 puntos y el de arriba en 90, falta 1.
    // Un `.find(f => f.pts > 89)` sobre esta lista devuelve 190 —el primero que
    // cumple— y respondía 101.
    expect(faltaParaSubir(tabla, 89)).toBe(1)
  })

  it('salta por encima de los que empatan con uno', () => {
    // Con 100 hay otros dos en 100: subir no es alcanzarlos, es pasar al de 110.
    expect(faltaParaSubir(tabla, 100)).toBe(10)
  })

  it('el que va primero no tiene a quién alcanzar', () => {
    expect(faltaParaSubir(tabla, 190)).toBe(0)
  })

  it('el que comparte el primer puesto tampoco', () => {
    expect(faltaParaSubir([{ pts: 50 }, { pts: 50 }, { pts: 20 }], 50)).toBe(0)
  })

  it('el último mide contra el que tiene justo encima', () => {
    expect(faltaParaSubir(tabla, 80)).toBe(9)
  })

  it('una tabla vacía no rompe', () => {
    expect(faltaParaSubir([], 10)).toBe(0)
  })
})
