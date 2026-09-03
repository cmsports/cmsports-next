import { describe, it, expect } from 'vitest'
import { ELO_INICIAL, actualizar, esperado, kDe, recorrer, type Resultado } from './elo'
import { CONFIG_POR_DEFECTO, crearLectorConfig } from './clubConfig'

const K = 24

describe('esperado', () => {
  it('dos iguales tienen la misma chance', () => {
    expect(esperado(1500, 1500)).toBe(0.5)
  })

  it('400 puntos de ventaja son 10 a 1', () => {
    // La escala clásica. Si esto cambia, el número deja de significar lo
    // mismo que en cualquier otro sistema Elo.
    expect(esperado(1900, 1500)).toBeCloseTo(10 / 11, 5)
  })
})

describe('actualizar', () => {
  it('1 · entre dos de 1500, lo que uno gana el otro lo pierde', () => {
    const r = actualizar({ eloA: 1500, eloB: 1500, resultado: 'gana', kA: K })
    expect(r.eloA).toBe(1512)
    expect(r.eloB).toBe(1488)
    expect(r.deltaA).toBe(-r.deltaB)
  })

  it('2 · ganarle a alguien mucho mejor mueve mucho', () => {
    const r = actualizar({ eloA: 1200, eloB: 1800, resultado: 'gana', kA: K })
    expect(r.deltaA).toBeGreaterThan(20)
  })

  it('3 · ganarle a alguien mucho peor mueve poco', () => {
    const r = actualizar({ eloA: 1800, eloB: 1200, resultado: 'gana', kA: K })
    expect(r.deltaA).toBeLessThan(4)
    expect(r.deltaA).toBeGreaterThan(0)
  })

  /**
   * 4 · El invariante que caza casi todo.
   *
   * Si la suma del sistema cambia, el cálculo está mal aunque todo lo demás
   * pase. Se prueba con números feos a propósito: es el redondeo el que la
   * rompe, y con 1500 contra 1500 el redondeo no se nota.
   */
  it('4 · la suma del sistema no se mueve, con cualquier par', () => {
    const pares: [number, number][] = [
      [1500, 1500], [1237, 1891], [1000, 1001], [2400, 1100], [1499, 1503],
    ]
    for (const [a, b] of pares) {
      for (const resultado of ['gana', 'pierde'] as const) {
        const r = actualizar({ eloA: a, eloB: b, resultado, kA: K })
        expect(r.eloA + r.eloB, `${a} vs ${b} (${resultado})`).toBe(a + b)
      }
    }
  })

  it('7 · un walkover no mueve el índice', () => {
    const r = actualizar({ eloA: 1500, eloB: 1800, resultado: 'walkover', kA: K })
    expect(r.eloA).toBe(1500)
    expect(r.eloB).toBe(1800)
  })

  it('7b · salvo que el club diga lo contrario', () => {
    const r = actualizar({ eloA: 1500, eloB: 1800, resultado: 'walkover', kA: K, cuentaWalkover: true })
    expect(r.eloA).toBeLessThan(1500)
  })

  /**
   * 8 · Con K distintos la suma NO se conserva, y es correcto.
   *
   * Esta prueba existe para que nadie lo "arregle": el plan pide un K mayor
   * para menores, y eso necesariamente inyecta o drena puntos del sistema. Es
   * la misma decisión que toma la FIDE. Lo que sí se mantiene es la dirección:
   * el que gana sube y el que pierde baja.
   */
  it('8 · con K distinto por categoría, el menor se mueve más', () => {
    const r = actualizar({ eloA: 1500, eloB: 1500, resultado: 'gana', kA: 40, kB: 24 })
    expect(r.deltaA).toBe(20)   // el menor, con K 40
    expect(r.deltaB).toBe(-12)  // el adulto, con K 24
    expect(r.eloA + r.eloB).not.toBe(3000)
  })
})

describe('kDe', () => {
  it('usa el K de menores solo para los menores', () => {
    expect(kDe(CONFIG_POR_DEFECTO, false)).toBe(24)
    expect(kDe(CONFIG_POR_DEFECTO, true)).toBe(40)
  })

  it('el club puede igualarlos y así desactivar la diferencia', () => {
    const config = crearLectorConfig([{ clave: 'elo.k_menores', valor: 24 }])
    expect(kDe(config, true)).toBe(24)
  })
})

describe('recorrer', () => {
  it('5 · un jugador sin partidos arranca en el valor inicial', () => {
    const r = recorrer({ partidos: [] })
    expect(r.elo).toBe(ELO_INICIAL)
    expect(r.jugados).toBe(0)
    expect(r.pasos).toHaveLength(0)
  })

  it('5b · y el club puede cambiar ese valor', () => {
    expect(recorrer({ inicial: 1200, partidos: [] }).elo).toBe(1200)
  })

  /**
   * 6 · Cien partidos alternados contra el mismo rival convergen.
   *
   * Si el cálculo divergiera, dos jugadores que se ganan por turnos se irían
   * a los extremos en vez de quedarse donde están. Es la prueba de que el
   * sistema es estable, no solo correcto en un partido suelto.
   */
  it('6 · el mismo par alternando 100 partidos converge, no diverge', () => {
    const partidos = Array.from({ length: 100 }, (_, i) => ({
      fecha: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      rivalId: 'rival',
      rivalElo: 1500,
      resultado: (i % 2 === 0 ? 'gana' : 'pierde') as Resultado,
      k: K,
    }))

    const r = recorrer({ partidos })
    // El rival se mantiene fijo en 1500 en este escenario, así que el índice
    // oscila alrededor de ahí en vez de escaparse.
    expect(Math.abs(r.elo - 1500)).toBeLessThan(K * 2)
    expect(r.jugados).toBe(100)
  })

  it('deja el rastro paso a paso, que es lo que dibuja la curva', () => {
    const r = recorrer({
      partidos: [
        { fecha: '2026-03-01', rivalId: 'a', rivalElo: 1500, resultado: 'gana', k: K },
        { fecha: '2026-03-08', rivalId: 'b', rivalElo: 1600, resultado: 'pierde', k: K },
      ],
    })
    expect(r.pasos).toHaveLength(2)
    expect(r.pasos[0].eloAntes).toBe(1500)
    expect(r.pasos[0].eloDespues).toBe(1512)
    // El siguiente arranca donde terminó el anterior: la curva no tiene saltos.
    expect(r.pasos[1].eloAntes).toBe(r.pasos[0].eloDespues)
  })

  it('un walkover que no mueve nada tampoco cuenta como partido jugado', () => {
    // Si contara, el promedio diría que alguien compitió cuando no se
    // presentó nadie.
    const r = recorrer({
      partidos: [{ fecha: '2026-03-01', rivalId: 'a', rivalElo: 1500, resultado: 'walkover', k: K }],
    })
    expect(r.jugados).toBe(0)
    expect(r.elo).toBe(ELO_INICIAL)
  })

  it('el orden importa: no es conmutativo', () => {
    // Documenta por qué `recorrer` recibe la lista ya ordenada y no la ordena
    // por su cuenta con un criterio que quizá no es el del club.
    const a = { fecha: '2026-03-01', rivalId: 'a', rivalElo: 1200, resultado: 'gana' as const, k: K }
    const b = { fecha: '2026-03-02', rivalId: 'b', rivalElo: 1900, resultado: 'gana' as const, k: K }
    expect(recorrer({ partidos: [a, b] }).elo).not.toBe(recorrer({ partidos: [b, a] }).elo)
  })
})
