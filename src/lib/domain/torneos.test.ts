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
  construirLlavesLayout,
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
  it('el ELO no altera la asignacion de grupos', () => {
    const a = jugadores(8)
    const b = a.map((j, i) => ({ ...j, elo: 9999 - i }))
    expect(seedingSerpenteo(a, 3)).toEqual(seedingSerpenteo(b, 3))
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
  it('los cabezas de serie 1° y 2° solo se cruzan en la final', () => {
    // Simula un torneo completo donde 1° y 2° siempre ganan, y verifica que
    // nunca comparten partido antes de la final. ELO adverso (ambos top).
    for (const n of [4, 5, 6, 7, 8, 9, 12, 16, 17, 24, 32]) {
      const js = jugadores(n)
      const mid = Math.ceil(n / 2)
      const primeros = js.slice(0, mid)
      const segundos = js.slice(mid)
      const s1 = primeros[0].id
      const s2 = primeros[1]?.id ?? segundos[0].id // ambos "arriba": caso adverso
      const byId = new Map(js.map(j => [j.id, j]))

      let partidos = generarBracketConAvance(primeros, segundos, s1, s2)
      let fase = partidos[0].fase as any
      let cruceFinal = false
      let guard = 0

      while (partidos.length && guard++ < 20) {
        const juntos = partidos.some(p =>
          (p.jugadorA === s1 && p.jugadorB === s2) || (p.jugadorA === s2 && p.jugadorB === s1))
        if (juntos) {
          expect(fase).toBe('final') // si se cruzan, solo puede ser en la final
          cruceFinal = true
        }
        // Ganadores: 1° y 2° siempre ganan; el resto gana el jugadorA
        const ganadores: JugadorTorneo[] = partidos.map(p => {
          if (p.ganador) return byId.get(p.ganador)!
          if (p.jugadorA === s1 || p.jugadorB === s1) return byId.get(s1)!
          if (p.jugadorA === s2 || p.jugadorB === s2) return byId.get(s2)!
          return byId.get(p.jugadorA)!
        })
        if (fase === 'final') break
        partidos = generarSiguienteFase(ganadores, fase, s1, s2)
        fase = partidos[0]?.fase as any
      }
      expect(cruceFinal).toBe(true) // ambos llegaron a la final y se cruzaron ahí
    }
  })
  it('el ELO no altera el sembrado (mismos cruces con ELO invertido)', () => {
    const a = jugadores(8)
    const b = a.map((j, i) => ({ ...j, elo: 9999 - i })) // ELO al revés
    const cruces = (js: JugadorTorneo[]) =>
      generarBracketConAvance(js.slice(0, 4), js.slice(4), 'j0', 'j1')
        .map(p => `${p.jugadorA}-${p.jugadorB}`).sort()
    expect(cruces(a)).toEqual(cruces(b))
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

describe('construirLlavesLayout', () => {
  it('todos los cupos de todos los grupos aparecen exactamente una vez', () => {
    const numGrupos = 4 // 8 clasificados → cuadro de 8, sin BYE
    const { faseInicial, matches } = construirLlavesLayout(numGrupos)
    expect(faseInicial).toBe('cuartos')
    const cupos = matches.flatMap(m => [m.a, m.b]).filter(Boolean)
    const claves = cupos.map(s => `${s!.grupoIdx}:${s!.pos}`)
    expect(new Set(claves).size).toBe(numGrupos * 2)
    expect(claves).toHaveLength(numGrupos * 2)
  })
  it('con grupos que no llenan potencia de 2, los BYE quedan como b=null', () => {
    const { matches } = construirLlavesLayout(3) // 6 clasificados → cuadro 8 → 2 BYE
    const byes = matches.filter(m => m.a && m.b === null)
    expect(byes).toHaveLength(2)
    // Ningún cupo real se pierde: 6 clasificados presentes
    const reales = matches.flatMap(m => [m.a, m.b]).filter(Boolean)
    expect(reales).toHaveLength(6)
  })
  it('el layout es estable: mismas entradas → mismos cupos (rellenado idempotente)', () => {
    const a = construirLlavesLayout(4, 0, 1)
    const b = construirLlavesLayout(4, 0, 1)
    expect(a).toEqual(b)
  })
  it('el cabeza de serie 1° queda en la posición de sembrado 1', () => {
    // Con cabeza en grupo 2, su 1° debe caer en el primer slot del bracket.
    const { matches } = construirLlavesLayout(4, 2, 3)
    const primerSlot = matches.find(m => m.orden === 0)!.a
    expect(primerSlot).toEqual({ grupoIdx: 2, pos: 1 })
  })
  it('regla espejo: 1 y 2 del mismo grupo quedan en mitades opuestas', () => {
    const numGrupos = 16
    const { matches } = construirLlavesLayout(numGrupos, 0, 1)
    const totalPosiciones = matches.length * 2
    const mitad = totalPosiciones / 2
    const posicionPorCupo = new Map<string, number>()

    matches.forEach((m, i) => {
      if (m.a) posicionPorCupo.set(`${m.a.grupoIdx}:${m.a.pos}`, i * 2)
      if (m.b) posicionPorCupo.set(`${m.b.grupoIdx}:${m.b.pos}`, i * 2 + 1)
    })

    for (let g = 0; g < numGrupos; g++) {
      const p1 = posicionPorCupo.get(`${g}:1`)
      const p2 = posicionPorCupo.get(`${g}:2`)
      expect(p1).toBeDefined()
      expect(p2).toBeDefined()
      expect(Math.floor(p1! / mitad)).not.toBe(Math.floor(p2! / mitad))
    }
  })
  it('regla espejo: los cabezas principales quedan en mitades opuestas', () => {
    const { matches } = construirLlavesLayout(16, 0, 1)
    const totalPosiciones = matches.length * 2
    const mitad = totalPosiciones / 2
    const posiciones = new Map<string, number>()

    matches.forEach((m, i) => {
      if (m.a) posiciones.set(`${m.a.grupoIdx}:${m.a.pos}`, i * 2)
      if (m.b) posiciones.set(`${m.b.grupoIdx}:${m.b.pos}`, i * 2 + 1)
    })

    expect(Math.floor(posiciones.get('0:1')! / mitad)).not.toBe(Math.floor(posiciones.get('1:1')! / mitad))
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
  it('mantiene el camino del cuadro sin re-sembrar ganadores', () => {
    const partidos = generarSiguienteFase(jugadores(8), '8vos')
    expect(partidos.map(p => [p.jugadorA, p.jugadorB])).toEqual([
      ['j0', 'j1'],
      ['j2', 'j3'],
      ['j4', 'j5'],
      ['j6', 'j7'],
    ])
  })
})
