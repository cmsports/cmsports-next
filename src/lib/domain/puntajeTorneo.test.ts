import { describe, it, expect } from 'vitest'
import { puestosDelTorneo, PUNTOS_CAMPEON, PUNTOS_GRUPO, type PartidoDelTorneo } from './puntajeTorneo'

const p = (
  jugador_a: string, jugador_b: string | null, ganador: string | null, fase: string | null,
): PartidoDelTorneo => ({ jugador_a, jugador_b, ganador, fase })

describe('puestosDelTorneo', () => {
  it('el que gana la final se lleva 100 y el que la pierde 90', () => {
    const puestos = puestosDelTorneo([p('ana', 'beto', 'ana', 'final')])
    expect(puestos.get('ana')).toEqual({ etiqueta: '1°', puntos: PUNTOS_CAMPEON })
    expect(puestos.get('beto')).toEqual({ etiqueta: '2°', puntos: 90 })
  })

  it('los dos que pierden en semis comparten 3-4 y 80 puntos', () => {
    // Nadie jugó un partido que los ordene entre sí: van iguales.
    const puestos = puestosDelTorneo([
      p('ana', 'cata', 'ana', 'semis'),
      p('beto', 'dani', 'beto', 'semis'),
      p('ana', 'beto', 'ana', 'final'),
    ])
    expect(puestos.get('cata')).toEqual({ etiqueta: '3-4', puntos: 80 })
    expect(puestos.get('dani')).toEqual({ etiqueta: '3-4', puntos: 80 })
  })

  it('los cuatro que pierden en cuartos comparten 5-8 y 60 puntos', () => {
    const puestos = puestosDelTorneo([
      p('ana', 'e', 'ana', 'cuartos'), p('cata', 'f', 'cata', 'cuartos'),
      p('beto', 'g', 'beto', 'cuartos'), p('dani', 'h', 'dani', 'cuartos'),
    ])
    for (const perdedor of ['e', 'f', 'g', 'h']) {
      expect(puestos.get(perdedor)).toEqual({ etiqueta: '5-8', puntos: 60 })
    }
  })

  it('perder en 8vos son 20 puntos y en 16vos son 10', () => {
    const puestos = puestosDelTorneo([
      p('ana', 'x', 'ana', '8vos'),
      p('beto', 'y', 'beto', '16vos'),
    ])
    expect(puestos.get('x')).toEqual({ etiqueta: '9-16', puntos: 20 })
    expect(puestos.get('y')).toEqual({ etiqueta: '17-32', puntos: 10 })
  })

  it('el que se queda en la fase de grupos igual suma por participar', () => {
    const puestos = puestosDelTorneo([
      p('ana', 'zoe', 'ana', 'grupos'),
      p('ana', 'beto', 'ana', 'final'),
    ])
    expect(puestos.get('zoe')).toEqual({ etiqueta: 'grupo', puntos: PUNTOS_GRUPO })
  })

  it('avanzar de grupos a la llave paga por la llave, no por el grupo', () => {
    // El campeón también jugó la fase de grupos; eso no puede bajarle el puesto.
    const puestos = puestosDelTorneo([
      p('ana', 'zoe', 'ana', 'grupos'),
      p('ana', 'beto', 'ana', 'final'),
    ])
    expect(puestos.get('ana')?.puntos).toBe(PUNTOS_CAMPEON)
  })

  it('manda la ronda más lejana a la que llegó, no el orden de los partidos', () => {
    const puestos = puestosDelTorneo([
      p('ana', 'beto', 'ana', 'final'),
      p('ana', 'cata', 'ana', '8vos'),
      p('ana', 'dani', 'ana', 'cuartos'),
    ])
    expect(puestos.get('ana')?.puntos).toBe(PUNTOS_CAMPEON)
  })

  it('un BYE cuenta como participación pero no como partido', () => {
    const puestos = puestosDelTorneo([p('ana', null, 'ana', '8vos')])
    expect(puestos.get('ana')).toBeDefined()
    expect(puestos.size).toBe(1)
  })

  it('sin final jugada, el que llegó más lejos no queda de campeón', () => {
    // Torneo sin cerrar: nadie ganó la final, así que nadie se lleva los 100.
    const puestos = puestosDelTorneo([p('ana', 'beto', 'ana', 'semis')])
    expect(puestos.get('ana')?.puntos).not.toBe(PUNTOS_CAMPEON)
    expect(puestos.get('beto')).toEqual({ etiqueta: '3-4', puntos: 80 })
  })

  it('una fase desconocida no rompe el cálculo del resto', () => {
    const puestos = puestosDelTorneo([
      p('ana', 'beto', 'ana', 'repechaje_raro'),
      p('cata', 'dani', 'cata', 'final'),
    ])
    expect(puestos.get('cata')?.puntos).toBe(PUNTOS_CAMPEON)
    expect(puestos.get('ana')?.puntos).toBe(PUNTOS_GRUPO)
  })
})
