import { describe, it, expect } from 'vitest'
import {
  calcularNumGrupos,
  calcularNumGruposTardios,
  generarRoundRobin,
  seedingSerpenteo,
  calcularTamanoBracket,
  determinarFaseInicial,
  siguienteFase,
  generarBracketConAvance,
  generarSiguienteFase,
  construirLlavesLayout,
  construirLlavesLayoutNumerado,
  calcularStatsGrupo,
  derivarPodioFinal,
  nombreGrupo,
  type JugadorTorneo,
} from './torneos'

function jugadores(n: number): JugadorTorneo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `j${i}`, nombre: `J${i}` }))
}

function posicionesLayout(numGrupos: number, cabeza1?: number, cabeza2?: number) {
  const { matches } = construirLlavesLayout(numGrupos, cabeza1, cabeza2)
  const posiciones = new Map<string, number>()
  matches.forEach((m, i) => {
    if (m.a) posiciones.set(`${m.a.grupoIdx}:${m.a.pos}`, i * 2)
    if (m.b) posiciones.set(`${m.b.grupoIdx}:${m.b.pos}`, i * 2 + 1)
  })
  return { matches, posiciones }
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

describe('derivarPodioFinal', () => {
  it('guarda ganador y perdedor de la final', () => {
    expect(derivarPodioFinal({ jugador_a: 'a', jugador_b: 'b', ganador: 'b' }))
      .toEqual({ campeonId: 'b', subcampeonId: 'a' })
  })

  it('rechaza una final incompleta o un ganador ajeno', () => {
    expect(derivarPodioFinal({ jugador_a: 'a', jugador_b: null, ganador: 'a' })).toBeNull()
    expect(derivarPodioFinal({ jugador_a: 'a', jugador_b: 'b', ganador: 'c' })).toBeNull()
  })
})

describe('clasificación de grupos sin sets ni puntos', () => {
  it('un empate de dos jugadores se resuelve por el enfrentamiento directo', () => {
    const js = jugadores(4)
    const { stats, hayTripleEmpate } = calcularStatsGrupo(js, [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j1' },
      { jugadorA: 'j0', jugadorB: 'j2', ganador: 'j0' },
      { jugadorA: 'j0', jugadorB: 'j3', ganador: 'j0' },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1' },
      { jugadorA: 'j1', jugadorB: 'j3', ganador: 'j3' },
      { jugadorA: 'j2', jugadorB: 'j3', ganador: 'j2' },
    ])
    expect(hayTripleEmpate).toBe(false)
    expect(stats.slice(0, 2).map(s => s.jugadorId)).toEqual(['j1', 'j0'])
  })

  it('un empate de tres líderes exige resolución manual', () => {
    const { hayTripleEmpate } = calcularStatsGrupo(jugadores(3), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0' },
      { jugadorA: 'j0', jugadorB: 'j2', ganador: 'j2' },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1' },
    ])
    expect(hayTripleEmpate).toBe(true)
  })

  it('detecta empate triple por el segundo cupo con líder único', () => {
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadores(4), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0' },
      { jugadorA: 'j0', jugadorB: 'j2', ganador: 'j0' },
      { jugadorA: 'j0', jugadorB: 'j3', ganador: 'j0' },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1' },
      { jugadorA: 'j1', jugadorB: 'j3', ganador: 'j3' },
      { jugadorA: 'j2', jugadorB: 'j3', ganador: 'j2' },
    ])
    expect(stats[0].jugadorId).toBe('j0')
    expect(hayTripleEmpate).toBe(true)
  })
})

describe('calcularNumGruposTardios', () => {
  it('mantiene entre 2 y 4 tardíos en un solo grupo', () => {
    expect(calcularNumGruposTardios(2)).toBe(1)
    expect(calcularNumGruposTardios(3)).toBe(1)
    expect(calcularNumGruposTardios(4)).toBe(1)
  })
  it('crea más grupos solamente al superar cuatro jugadores', () => {
    expect(calcularNumGruposTardios(5)).toBe(2)
    expect(calcularNumGruposTardios(8)).toBe(2)
    expect(calcularNumGruposTardios(9)).toBe(3)
  })
})

describe('nombreGrupo', () => {
  it('continúa correctamente después de la Z', () => {
    expect(nombreGrupo(0)).toBe('A')
    expect(nombreGrupo(25)).toBe('Z')
    expect(nombreGrupo(26)).toBe('AA')
    expect(nombreGrupo(31)).toBe('AF')
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
  it('conserva un sembrado determinista para el mismo orden', () => {
    const lista = jugadores(8)
    expect(seedingSerpenteo(lista, 3)).toEqual(seedingSerpenteo([...lista], 3))
  })
  it('respeta el orden numérico explícito de las cabezas', () => {
    const js = jugadores(8)
    const asign = seedingSerpenteo(js, 4, ['j3', 'j1', 'j6', 'j0'])
    expect(['j3', 'j1', 'j6', 'j0'].map(id => asign.find(a => a.jugadorId === id)!.grupoIndex))
      .toEqual([0, 1, 2, 3])
  })
})

describe('construirLlavesLayoutNumerado', () => {
  const posicionDe = (layout: ReturnType<typeof construirLlavesLayoutNumerado>, grupoIdx: number, pos: 1 | 2) => {
    const i = layout.matches.findIndex(m =>
      (m.a?.grupoIdx === grupoIdx && m.a.pos === pos) || (m.b?.grupoIdx === grupoIdx && m.b.pos === pos),
    )
    return i
  }

  it('usa los partidos canónicos del espejo estándar para cuatro cabezas', () => {
    const layout = construirLlavesLayoutNumerado(4, [
      { numero: 1, grupoIdx: 0, pos: 1 },
      { numero: 2, grupoIdx: 1, pos: 1 },
      { numero: 3, grupoIdx: 2, pos: 1 },
      { numero: 4, grupoIdx: 3, pos: 1 },
    ])
    expect([0, 1, 2, 3].map((g, i) => posicionDe(layout, g, 1)))
      .toEqual([0, 2, 3, 1])
  })

  it('prioriza BYE para 1ros sobre 2dos', () => {
    // 5 grupos → bracket de 16 → 6 BYEs. Los 5 primeros reciben BYE, 1 segundo también.
    const layout = construirLlavesLayoutNumerado(5, [
      { numero: 1, grupoIdx: 0, pos: 1 },
      { numero: 2, grupoIdx: 1, pos: 1 },
      { numero: 3, grupoIdx: 2, pos: 1 },
      { numero: 4, grupoIdx: 3, pos: 1 },
      { numero: 5, grupoIdx: 4, pos: 1 },
    ])
    const byes = new Set(layout.matches.filter(m => !m.b).map(m => `${m.a!.grupoIdx}:${m.a!.pos}`))
    // Todos los 1ros deberían tener BYE
    expect(byes.has('0:1')).toBe(true)
    expect(byes.has('1:1')).toBe(true)
    expect(byes.has('2:1')).toBe(true)
    expect(byes.has('3:1')).toBe(true)
    expect(byes.has('4:1')).toBe(true)
    // Y 1 segundo también (6 BYEs - 5 primeros = 1 segundo)
    const byesSegundos = layout.matches.filter(m => !m.b && m.a!.pos === 2)
    expect(byesSegundos).toHaveLength(1)
  })

  it('conserva invariantes para 2 a 32 grupos y varias semillas', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      const cabezas = Array.from({ length: Math.min(numGrupos, 8) }, (_, i) => ({
        numero: i + 1,
        grupoIdx: i,
        pos: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      }))
      const layout = construirLlavesLayoutNumerado(numGrupos, cabezas, Array.from({ length: Math.ceil(numGrupos / 2) }, (_, i) => i))
      const tam = calcularTamanoBracket(numGrupos * 2)
      expect(layout.matches).toHaveLength(tam / 2)
      const cupos = layout.matches.flatMap(m => [m.a, m.b]).filter(Boolean)
      expect(cupos).toHaveLength(numGrupos * 2)
      expect(new Set(cupos.map(c => `${c!.grupoIdx}:${c!.pos}`)).size).toBe(numGrupos * 2)
      for (const m of layout.matches.filter(m => m.a && m.b)) {
        expect(m.a!.grupoIdx).not.toBe(m.b!.grupoIdx)
      }
      for (let g = 0; g < numGrupos; g++) {
        const p1 = posicionDe(layout, g, 1)
        const p2 = posicionDe(layout, g, 2)
        expect(p1 < layout.matches.length / 2).not.toBe(p2 < layout.matches.length / 2)
      }
    }
  })

  it('es determinista con grupos pendientes', () => {
    const cabezas = [
      { numero: 1, grupoIdx: 0, pos: 2 as const },
      { numero: 2, grupoIdx: 1, pos: 1 as const },
      { numero: 3, grupoIdx: 2, pos: 1 as const },
    ]
    expect(construirLlavesLayoutNumerado(7, cabezas, [0, 1, 2, 3]))
      .toEqual(construirLlavesLayoutNumerado(7, [...cabezas], [0, 1, 2, 3]))
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

describe('semillas principales', () => {
  it('los cabezas de serie 1° y 2° solo se cruzan en la final', () => {
    // Simula un torneo completo donde 1° y 2° siempre ganan, y verifica que
    // nunca comparten partido antes de la final.
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
  it('con la mitad de grupos cerrados deja ramas completas listas para jugar', () => {
    const gruposListos = [0, 1, 2, 3]
    const { matches } = construirLlavesLayout(8, null, null, gruposListos)
    const listos = new Set(gruposListos)
    const jugables = matches.filter(m =>
      m.a && m.b && listos.has(m.a.grupoIdx) && listos.has(m.b.grupoIdx),
    )
    expect(jugables.length).toBeGreaterThan(0)
    expect(jugables.every(m => m.a!.grupoIdx !== m.b!.grupoIdx)).toBe(true)
  })

  it('nunca cruza jugadores del mismo grupo', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      const { matches } = construirLlavesLayout(numGrupos, { grupoIdx: 0, pos: 1 }, { grupoIdx: 1, pos: 1 })
      for (const partido of matches.filter(m => m.a && m.b)) {
        expect(partido.a!.grupoIdx).not.toBe(partido.b!.grupoIdx)
      }
    }
  })

  it('mantiene un cuadro válido aunque las cabezas terminen 1° o 2°', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      for (const pos1 of [1, 2] as const) {
        for (const pos2 of [1, 2] as const) {
          const { matches } = construirLlavesLayout(
            numGrupos,
            { grupoIdx: 0, pos: pos1 },
            { grupoIdx: 1, pos: pos2 },
          )
          expect(matches).toHaveLength(calcularTamanoBracket(numGrupos * 2) / 2)
          const cupos = matches.flatMap(m => [m.a, m.b]).filter(Boolean)
          expect(new Set(cupos.map(c => `${c!.grupoIdx}:${c!.pos}`)).size).toBe(numGrupos * 2)
          for (const partido of matches.filter(m => m.a && m.b)) {
            expect(partido.a!.grupoIdx).not.toBe(partido.b!.grupoIdx)
          }
        }
      }
    }
  })

  it('separa cabezas de grupos distintos para 3 o más grupos', () => {
    for (let numGrupos = 3; numGrupos <= 32; numGrupos++) {
      for (const pos1 of [1, 2] as const) {
        for (const pos2 of [1, 2] as const) {
          const layoutCabezas = construirLlavesLayout(
            numGrupos,
            { grupoIdx: 0, pos: pos1 },
            { grupoIdx: 1, pos: pos2 },
          )
          const pos = new Map<string, number>()
          layoutCabezas.matches.forEach((m, i) => {
            if (m.a) pos.set(`${m.a.grupoIdx}:${m.a.pos}`, i * 2)
            if (m.b) pos.set(`${m.b.grupoIdx}:${m.b.pos}`, i * 2 + 1)
          })
          const mitad = layoutCabezas.matches.length
          expect(Math.floor(pos.get(`0:${pos1}`)! / mitad))
            .not.toBe(Math.floor(pos.get(`1:${pos2}`)! / mitad))
        }
      }
    }
  })

  it('prioriza BYE para primeros de grupo sobre segundos', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      const { matches } = construirLlavesLayout(numGrupos)
      const tamano = calcularTamanoBracket(numGrupos * 2)
      const byesEsperados = tamano - numGrupos * 2
      const byes = matches.filter(m => m.a && !m.b).map(m => m.a!)
      expect(byes).toHaveLength(byesEsperados)
      const byesPrimeros = byes.filter(s => s.pos === 1).length
      const byesSegundos = byes.filter(s => s.pos === 2).length
      // 1ros reciben BYE primero; 2dos solo si sobran
      expect(byesPrimeros).toBeGreaterThanOrEqual(byesSegundos)
    }
  })

  it('prioriza BYE para cabezas de serie cuando hay cupo compatible', () => {
    // 3 grupos → bracket de 8 → 2 BYEs. Ambos cabezas (1ros) reciben BYE.
    const tres = construirLlavesLayout(3, { grupoIdx: 0, pos: 1 }, { grupoIdx: 1, pos: 1 })
    const byesTres = tres.matches.filter(m => !m.b).map(m => `${m.a!.grupoIdx}:${m.a!.pos}`)
    expect(byesTres).toContain('0:1')
    expect(byesTres).toContain('1:1')

    const cinco = construirLlavesLayout(5, { grupoIdx: 0, pos: 1 }, { grupoIdx: 1, pos: 1 })
    const byesCinco = cinco.matches.filter(m => !m.b).map(m => `${m.a!.grupoIdx}:${m.a!.pos}`)
    expect(byesCinco).toContain('0:1')
    expect(byesCinco).toContain('1:1')

    const posicionesMixtas = construirLlavesLayout(5, { grupoIdx: 0, pos: 1 }, { grupoIdx: 1, pos: 2 })
    const byesMixtos = posicionesMixtas.matches.filter(m => !m.b).map(m => `${m.a!.grupoIdx}:${m.a!.pos}`)
    expect(byesMixtos).toContain('0:1')
    expect(byesMixtos).toContain('1:2')
  })

  it('ubica primero y segundo del mismo grupo en mitades opuestas para 2 a 32 grupos', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      const { matches, posiciones } = posicionesLayout(numGrupos, 0, 1)
      const mitad = matches.length
      for (let g = 0; g < numGrupos; g++) {
        expect(Math.floor(posiciones.get(`${g}:1`)! / mitad))
          .not.toBe(Math.floor(posiciones.get(`${g}:2`)! / mitad))
      }
    }
  })

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
    const { matches, posiciones: posicionPorCupo } = posicionesLayout(numGrupos, 0, 1)
    const totalPosiciones = matches.length * 2
    const mitad = totalPosiciones / 2

    for (let g = 0; g < numGrupos; g++) {
      const p1 = posicionPorCupo.get(`${g}:1`)
      const p2 = posicionPorCupo.get(`${g}:2`)
      expect(p1).toBeDefined()
      expect(p2).toBeDefined()
      expect(Math.floor(p1! / mitad)).not.toBe(Math.floor(p2! / mitad))
    }
  })
  it('regla espejo se mantiene con grupos pares, impares y BYE', () => {
    for (const numGrupos of [3, 4, 5, 8, 10, 16]) {
      const { matches, posiciones } = posicionesLayout(numGrupos, 0, Math.min(1, numGrupos - 1))
      const totalPosiciones = matches.length * 2
      const mitad = totalPosiciones / 2
      const claves = Array.from(posiciones.keys())

      expect(new Set(claves).size).toBe(numGrupos * 2)
      expect(claves).toHaveLength(numGrupos * 2)

      for (let g = 0; g < numGrupos; g++) {
        const p1 = posiciones.get(`${g}:1`)
        const p2 = posiciones.get(`${g}:2`)
        expect(p1).toBeDefined()
        expect(p2).toBeDefined()
        expect(Math.floor(p1! / mitad)).not.toBe(Math.floor(p2! / mitad))
      }
    }
  })
  it('la correccion de un grupo cambia los cupos reales del bracket sin mover el arbol', () => {
    const jugadoresGrupo = [
      { id: 'armando', nombre: 'Armando' },
      { id: 'nelson', nombre: 'Nelson' },
      { id: 'carlos', nombre: 'Carlos' },
    ]
    const antes = calcularStatsGrupo(jugadoresGrupo, [
      { jugadorA: 'armando', jugadorB: 'nelson', ganador: 'armando' },
      { jugadorA: 'armando', jugadorB: 'carlos', ganador: 'armando' },
      { jugadorA: 'nelson', jugadorB: 'carlos', ganador: 'nelson' },
    ]).stats
    const despues = calcularStatsGrupo(jugadoresGrupo, [
      { jugadorA: 'armando', jugadorB: 'nelson', ganador: 'nelson' },
      { jugadorA: 'armando', jugadorB: 'carlos', ganador: 'armando' },
      { jugadorA: 'nelson', jugadorB: 'carlos', ganador: 'nelson' },
    ]).stats
    const { matches } = construirLlavesLayout(2, 0, 1)
    const materializar = (primeroGrupo0: string, segundoGrupo0: string) =>
      matches.map(m => [m.a?.grupoIdx === 0 ? (m.a.pos === 1 ? primeroGrupo0 : segundoGrupo0) : `${m.a?.grupoIdx}:${m.a?.pos}`,
        m.b?.grupoIdx === 0 ? (m.b.pos === 1 ? primeroGrupo0 : segundoGrupo0) : `${m.b?.grupoIdx}:${m.b?.pos}`])

    expect([antes[0].jugadorId, antes[1].jugadorId]).toEqual(['armando', 'nelson'])
    expect([despues[0].jugadorId, despues[1].jugadorId]).toEqual(['nelson', 'armando'])
    expect(materializar(despues[0].jugadorId, despues[1].jugadorId)).not.toEqual(materializar(antes[0].jugadorId, antes[1].jugadorId))
    expect(matches).toEqual(construirLlavesLayout(2, 0, 1).matches)
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
