import { describe, it, expect } from 'vitest'
import {
  calcularNumGrupos,
  generarRoundRobin,
  seedingSerpenteo,
  calcularTamanoBracket,
  determinarFaseInicial,
  siguienteFase,
  aplicarSemillasPrincipales,
  generarBracketConAvance,
  generarSiguienteFase,
  type JugadorTorneo,
} from './torneos'

function jugadores(n: number): JugadorTorneo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `j${i}`, nombre: `J${i}`, elo: 1200 + i * 10 }))
}

describe('calcularNumGrupos', () => {
  it('nunca devuelve menos de 2 grupos', () => {
    expect(calcularNumGrupos(3)).toBe(2)
    expect(calcularNumGrupos(4)).toBe(2)
  })
  it('reparte ~3 jugadores por grupo', () => {
    expect(calcularNumGrupos(6)).toBe(2)
    expect(calcularNumGrupos(9)).toBe(3)
    expect(calcularNumGrupos(12)).toBe(4)
  })
})

describe('generarRoundRobin', () => {
  it('genera n(n-1)/2 partidos', () => {
    expect(generarRoundRobin(['a', 'b', 'c', 'd'])).toHaveLength(6)
    expect(generarRoundRobin(['a', 'b', 'c'])).toHaveLength(3)
  })
  it('cada pareja aparece una sola vez, sin repetir jugador contra sí mismo', () => {
    const pares = generarRoundRobin(['a', 'b', 'c'])
    const claves = pares.map(([x, y]) => [x, y].sort().join('~'))
    expect(new Set(claves).size).toBe(pares.length)
    expect(pares.every(([x, y]) => x !== y)).toBe(true)
  })
})

describe('seedingSerpenteo', () => {
  it('asigna a todos los jugadores exactamente una vez', () => {
    const asign = seedingSerpenteo(jugadores(6), 2)
    expect(asign).toHaveLength(6)
    expect(new Set(asign.map(a => a.jugadorId)).size).toBe(6)
  })
  it('reparte de forma balanceada entre grupos (difieren en ≤1)', () => {
    const asign = seedingSerpenteo(jugadores(7), 3)
    const counts = [0, 0, 0]
    asign.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })
  it('los cabezas de serie caen en grupos distintos', () => {
    const js = jugadores(6)
    const cabezas = new Set([js[0].id, js[1].id])
    const asign = seedingSerpenteo(js, 2, cabezas)
    const g0 = asign.find(a => a.jugadorId === js[0].id)!.grupoIndex
    const g1 = asign.find(a => a.jugadorId === js[1].id)!.grupoIndex
    expect(g0).not.toBe(g1)
  })
})

describe('bracket helpers', () => {
  it('calcularTamanoBracket redondea a la siguiente potencia de 2', () => {
    expect(calcularTamanoBracket(2)).toBe(2)
    expect(calcularTamanoBracket(3)).toBe(4)
    expect(calcularTamanoBracket(5)).toBe(8)
    expect(calcularTamanoBracket(8)).toBe(8)
  })
  it('determinarFaseInicial mapea tamaño → fase', () => {
    expect(determinarFaseInicial(2)).toBe('final')
    expect(determinarFaseInicial(4)).toBe('semis')
    expect(determinarFaseInicial(8)).toBe('cuartos')
  })
  it('siguienteFase avanza y termina en final', () => {
    expect(siguienteFase('cuartos')).toBe('semis')
    expect(siguienteFase('semis')).toBe('final')
    expect(siguienteFase('final')).toBeNull()
  })
})

describe('aplicarSemillasPrincipales', () => {
  it('mueve las semillas 1 y 2 al frente sin duplicar', () => {
    const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const r = aplicarSemillasPrincipales(lista, 'c', 'a')
    expect(r[0].id).toBe('c')
    expect(r[1].id).toBe('a')
    expect(r).toHaveLength(4)
    expect(new Set(r.map(x => x.id)).size).toBe(4)
  })
  it('sin semillas devuelve la lista igual', () => {
    const lista = [{ id: 'a' }, { id: 'b' }]
    expect(aplicarSemillasPrincipales(lista)).toEqual(lista)
  })
})

describe('generarBracketConAvance', () => {
  it('con 4 clasificados genera 2 partidos, sin jugador contra sí mismo', () => {
    const primeros = jugadores(2)
    const segundos = jugadores(2).map(j => ({ ...j, id: j.id + 's' }))
    const partidos = generarBracketConAvance(primeros, segundos)
    expect(partidos).toHaveLength(2)
    expect(partidos.every(p => p.jugadorA !== p.jugadorB)).toBe(true)
  })
})

describe('generarSiguienteFase', () => {
  it('con 4 ganadores en cuartos genera 2 partidos de semis', () => {
    const ganadores = jugadores(4)
    const partidos = generarSiguienteFase(ganadores, 'cuartos')
    expect(partidos).toHaveLength(2)
    expect(partidos.every(p => p.fase === 'semis')).toBe(true)
  })
  it('un número impar de ganadores deja un bye', () => {
    const partidos = generarSiguienteFase(jugadores(3), 'cuartos')
    const byes = partidos.filter(p => p.jugadorB === null)
    expect(byes).toHaveLength(1)
  })
})
