import { describe, it, expect } from 'vitest'
import {
  generarLiguilla,
  maxJugadoresDeLiguilla,
  partidosDeLiguilla,
  rondasDeLiguilla,
  type PartidoLiguilla,
} from './torneoLiguilla'
import { CONFIG } from '../config'

const jugadores = (n: number) => Array.from({ length: n }, (_, i) => `j${i + 1}`)

/** La clave de un cruce sin importar de qué lado quedó cada uno. */
const cruce = (p: PartidoLiguilla) => [p.jugadorA, p.jugadorB].sort().join('|')

const porRonda = (partidos: PartidoLiguilla[]) => {
  const mapa = new Map<number, PartidoLiguilla[]>()
  for (const p of partidos) mapa.set(p.ronda, [...(mapa.get(p.ronda) ?? []), p])
  return mapa
}

describe('cuántos partidos y cuántas fechas', () => {
  it('una rueda es n(n-1)/2', () => {
    expect(partidosDeLiguilla(6)).toBe(15)
    expect(partidosDeLiguilla(8)).toBe(28)
    expect(partidosDeLiguilla(12)).toBe(66)
    expect(partidosDeLiguilla(16)).toBe(120)
  })

  // El número que se muestra antes de cerrar la inscripción. Doce jugadores a
  // ida y vuelta son once horas de mesa con cuatro mesas.
  it('dos ruedas es el doble', () => {
    expect(partidosDeLiguilla(12, 2)).toBe(132)
    expect(partidosDeLiguilla(6, 2)).toBe(30)
  })

  it('con menos de dos jugadores no hay torneo', () => {
    expect(partidosDeLiguilla(0)).toBe(0)
    expect(partidosDeLiguilla(1)).toBe(0)
    expect(rondasDeLiguilla(1)).toBe(0)
  })

  it('con N par son N-1 fechas; con N impar son N, porque alguien descansa', () => {
    expect(rondasDeLiguilla(12)).toBe(11)
    expect(rondasDeLiguilla(8)).toBe(7)
    expect(rondasDeLiguilla(7)).toBe(7)
    expect(rondasDeLiguilla(5)).toBe(5)
  })

  it('las fechas también se duplican en ida y vuelta', () => {
    expect(rondasDeLiguilla(12, 2)).toBe(22)
    expect(rondasDeLiguilla(7, 2)).toBe(14)
  })
})

// El aviso de "no cabe" tiene que decir qué SÍ cabe. Con 21 inscritos a una
// rueda ya son 210 partidos, así que sugerir "usá una rueda" no ayuda: hay que
// decir cuántos entran.
describe('cuántos inscritos entran en una liguilla', () => {
  it('con 200 partidos de tope entran 20 a una rueda y 14 a ida y vuelta', () => {
    expect(maxJugadoresDeLiguilla(200, 1)).toBe(20)
    expect(maxJugadoresDeLiguilla(200, 2)).toBe(14)
  })

  it('el que devuelve siempre cabe, y uno más no', () => {
    for (const tope of [50, 120, 200, 400]) {
      for (const ruedas of [1, 2] as const) {
        const max = maxJugadoresDeLiguilla(tope, ruedas)
        expect(partidosDeLiguilla(max, ruedas), `tope=${tope} ruedas=${ruedas}`).toBeLessThanOrEqual(tope)
        expect(partidosDeLiguilla(max + 1, ruedas)).toBeGreaterThan(tope)
      }
    }
  })

  it('nunca devuelve menos de dos, que es el mínimo para un partido', () => {
    expect(maxJugadoresDeLiguilla(1, 1)).toBeGreaterThanOrEqual(2)
  })

  // Spinhouse pidió soportar cerca de 30 inscritos en todos contra todos
  // (2026-09-09). Son 435 partidos repartidos en 29 fechas: una liga semanal,
  // no una jornada. Si alguien baja el tope, esto se lo dice antes de que el
  // club se entere el día de la inscripción.
  it('el tope configurado admite una liguilla de 30 a una rueda', () => {
    expect(partidosDeLiguilla(30, 1)).toBe(435)
    expect(rondasDeLiguilla(30, 1)).toBe(29)
    expect(maxJugadoresDeLiguilla(CONFIG.LIGUILLA_MAX_PARTIDOS, 1)).toBeGreaterThanOrEqual(30)
  })
})

describe('todos juegan contra todos, exactamente una vez', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 11, 12]) {
    it(`con ${n} jugadores genera todos los cruces sin repetir`, () => {
      const partidos = generarLiguilla(jugadores(n))
      expect(partidos).toHaveLength(partidosDeLiguilla(n))

      const cruces = partidos.map(cruce)
      expect(new Set(cruces).size).toBe(cruces.length)

      // Y están TODOS: no basta con que no se repitan.
      const esperados = new Set<string>()
      const ids = jugadores(n)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) esperados.add([ids[i], ids[j]].sort().join('|'))
      }
      expect(new Set(cruces)).toEqual(esperados)
    })
  }

  it('nadie se enfrenta a sí mismo', () => {
    for (const p of generarLiguilla(jugadores(9))) {
      expect(p.jugadorA).not.toBe(p.jugadorB)
    }
  })
})

// Ésta es la razón de existir de este módulo. Con el doble bucle de
// `generarRoundRobin`, el primer jugador juega todos sus partidos seguidos.
describe('el calendario es jugable: nadie juega dos veces en la misma fecha', () => {
  for (const n of [4, 5, 8, 11, 12]) {
    it(`con ${n} jugadores, cada uno juega a lo sumo una vez por fecha`, () => {
      for (const [ronda, partidos] of porRonda(generarLiguilla(jugadores(n)))) {
        const enLaFecha = partidos.flatMap(p => [p.jugadorA, p.jugadorB])
        expect(
          new Set(enLaFecha).size,
          `alguien juega dos veces en la fecha ${ronda}`,
        ).toBe(enLaFecha.length)
      }
    })
  }

  it('con N par juegan todos en cada fecha', () => {
    const rondas = porRonda(generarLiguilla(jugadores(8)))
    expect(rondas.size).toBe(7)
    for (const partidos of rondas.values()) expect(partidos).toHaveLength(4)
  })

  it('con N impar descansa exactamente uno por fecha', () => {
    const n = 7
    const rondas = porRonda(generarLiguilla(jugadores(n)))
    expect(rondas.size).toBe(7)
    for (const partidos of rondas.values()) {
      expect(partidos).toHaveLength(3)
      const juegan = new Set(partidos.flatMap(p => [p.jugadorA, p.jugadorB]))
      expect(juegan.size).toBe(n - 1)
    }
  })

  it('las fechas van de 1 a N sin saltarse ninguna', () => {
    const partidos = generarLiguilla(jugadores(10))
    const rondas = [...new Set(partidos.map(p => p.ronda))].sort((a, b) => a - b)
    expect(rondas).toEqual(Array.from({ length: 9 }, (_, i) => i + 1))
  })
})

describe('la vuelta', () => {
  it('repite cada cruce una segunda vez', () => {
    const partidos = generarLiguilla(jugadores(6), 2)
    expect(partidos).toHaveLength(30)
    const cuentas = new Map<string, number>()
    for (const p of partidos) cuentas.set(cruce(p), (cuentas.get(cruce(p)) ?? 0) + 1)
    for (const veces of cuentas.values()) expect(veces).toBe(2)
  })

  // En tenis de mesa no hay localía, pero `jugador_a` saca primero.
  it('invierte los lados: quien sacó primero en la ida, no lo hace en la vuelta', () => {
    const partidos = generarLiguilla(jugadores(6), 2)
    const mitad = partidos.length / 2
    const ida = partidos.slice(0, mitad)
    const vuelta = partidos.slice(mitad)

    expect(vuelta).toHaveLength(mitad)
    ida.forEach((p, i) => {
      expect(vuelta[i].jugadorA).toBe(p.jugadorB)
      expect(vuelta[i].jugadorB).toBe(p.jugadorA)
    })
  })

  it('la vuelta arranca después de la última fecha de la ida', () => {
    const partidos = generarLiguilla(jugadores(6), 2)
    const rondas = [...new Set(partidos.map(p => p.ronda))].sort((a, b) => a - b)
    expect(rondas).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('la vuelta también es jugable', () => {
    for (const [, partidos] of porRonda(generarLiguilla(jugadores(9), 2))) {
      const enLaFecha = partidos.flatMap(p => [p.jugadorA, p.jugadorB])
      expect(new Set(enLaFecha).size).toBe(enLaFecha.length)
    }
  })
})

describe('casos borde', () => {
  it('sin jugadores no hay partidos', () => {
    expect(generarLiguilla([])).toEqual([])
    expect(generarLiguilla(['solo'])).toEqual([])
  })

  it('con dos jugadores es un partido, o dos en ida y vuelta', () => {
    expect(generarLiguilla(['a', 'b'])).toEqual([{ jugadorA: 'a', jugadorB: 'b', ronda: 1 }])
    expect(generarLiguilla(['a', 'b'], 2)).toEqual([
      { jugadorA: 'a', jugadorB: 'b', ronda: 1 },
      { jugadorA: 'b', jugadorB: 'a', ronda: 2 },
    ])
  })

  it('no reparte el saque siempre para el mismo lado', () => {
    // Con el círculo sin alternar, el jugador fijo en la posición 0 sacaría
    // primero en todos sus partidos.
    const partidos = generarLiguilla(jugadores(8))
    const saca = partidos.filter(p => p.jugadorA === 'j1').length
    const recibe = partidos.filter(p => p.jugadorB === 'j1').length
    expect(saca + recibe).toBe(7)
    expect(saca).toBeGreaterThan(0)
    expect(recibe).toBeGreaterThan(0)
  })
})
