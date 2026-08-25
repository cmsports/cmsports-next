import { describe, it, expect } from 'vitest'
import {
  calcularNumGrupos,
  calcularNumGruposTardios,
  generarRoundRobin,
  seedingSerpenteo,
  seedingSerpenteoConClubes,
  calcularTamanoBracket,
  determinarFaseInicial,
  siguienteFase,
  generarBracketConAvance,
  generarSiguienteFase,
  construirLlavesLayout,
  construirLlavesLayoutNumerado,
  calcularStatsGrupo,
  rankearClasificados,
  construirBracketPorRanking,
  construirLayoutPorRanking,
  derivarPodioFinal,
  nombreGrupo,
  type JugadorTorneo,
  type ClasificadoConStats,
  type RankeadoParaBracket,
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

describe('seedingSerpenteoConClubes', () => {
  function jugadoresConClub(clubes: (string | null)[]): JugadorTorneo[] {
    return clubes.map((club, i) => ({ id: `j${i}`, nombre: `J${i}`, club }))
  }

  it('asigna a todos los jugadores exactamente una vez', () => {
    const asign = seedingSerpenteoConClubes(jugadoresConClub([null, null, null, null, null, null]), 2)
    expect(asign).toHaveLength(6)
    expect(new Set(asign.map(a => a.jugadorId)).size).toBe(6)
  })

  it('reparte de forma balanceada entre grupos (difieren en ≤1) aunque no haya clubes', () => {
    const asign = seedingSerpenteoConClubes(jugadoresConClub(Array(7).fill(null)), 3)
    const counts = [0, 0, 0]
    asign.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('evita juntar a dos jugadores del mismo club cuando alcanzan los grupos', () => {
    // 2 clubes de 3 jugadores cada uno, 3 grupos → cabe uno de cada club por grupo
    const js = jugadoresConClub(['A', 'A', 'A', 'B', 'B', 'B'])
    const asign = seedingSerpenteoConClubes(js, 3)
    const grupoDe = new Map(asign.map(a => [a.jugadorId, a.grupoIndex]))
    for (const club of ['A', 'B']) {
      const grupos = js.filter(j => j.club === club).map(j => grupoDe.get(j.id))
      expect(new Set(grupos).size).toBe(3)
    }
  })

  it('permite el choque cuando es matemáticamente inevitable (regla blanda)', () => {
    // 5 jugadores del mismo club, solo 2 grupos: no hay forma de separarlos a todos
    const js = jugadoresConClub(['A', 'A', 'A', 'A', 'A'])
    const asign = seedingSerpenteoConClubes(js, 2)
    expect(asign).toHaveLength(5)
    expect(new Set(asign.map(a => a.jugadorId)).size).toBe(5)
    // sigue balanceado aunque haya choques inevitables
    const counts = [0, 0]
    asign.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('los cabezas de serie caen en grupos distintos, igual que la serpentina normal', () => {
    const js = jugadoresConClub([null, null, null, null, null, null])
    const cabezas = [js[0].id, js[1].id]
    const asign = seedingSerpenteoConClubes(js, 2, cabezas)
    const g0 = asign.find(a => a.jugadorId === js[0].id)!.grupoIndex
    const g1 = asign.find(a => a.jugadorId === js[1].id)!.grupoIndex
    expect(g0).not.toBe(g1)
  })

  it('16 jugadores en 6 grupos nunca produce un grupo de 4', () => {
    const clubes = ['A', 'B', 'C', 'A', 'B', 'C', 'D', 'D', 'A', 'B', 'C', 'D', 'E', 'E', 'F', 'F']
    const js = jugadoresConClub(clubes)
    const asign = seedingSerpenteoConClubes(js, 6)
    const counts = new Array(6).fill(0)
    asign.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts)).toBeLessThanOrEqual(3)
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2)
  })

  it('una cabeza de serie también cuenta como miembro de su club para evitar choques', () => {
    // j0 es cabeza y de club A; j1 también es de club A. No debería caer en el grupo de j0
    // si existe alternativa.
    const js = jugadoresConClub(['A', 'A', 'B', 'B'])
    const asign = seedingSerpenteoConClubes(js, 2, [js[0].id])
    const grupoCabeza = asign.find(a => a.jugadorId === js[0].id)!.grupoIndex
    const grupoOtroA = asign.find(a => a.jugadorId === js[1].id)!.grupoIndex
    expect(grupoOtroA).not.toBe(grupoCabeza)
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

  it('reparte el BYE balanceado entre 1ros y 2dos: nunca 2° vs 2°', () => {
    // 5 grupos → bracket de 16 → 6 BYEs. Antes se le daba BYE a los 5
    // primeros sin tope, dejando 2dos sobrantes que terminaban jugando entre
    // ellos. Ahora el BYE se reparte para que primeros-que-juegan y
    // segundos-que-juegan queden parejos, así todo partido real es 1° vs 2°.
    const layout = construirLlavesLayoutNumerado(5, [
      { numero: 1, grupoIdx: 0, pos: 1 },
      { numero: 2, grupoIdx: 1, pos: 1 },
      { numero: 3, grupoIdx: 2, pos: 1 },
      { numero: 4, grupoIdx: 3, pos: 1 },
      { numero: 5, grupoIdx: 4, pos: 1 },
    ])
    const reales = layout.matches.filter(m => m.a && m.b)
    for (const m of reales) {
      expect(m.a!.pos).not.toBe(m.b!.pos) // nunca 1°vs1° ni 2°vs2°
    }
    const byes = layout.matches.filter(m => !m.b).map(m => m.a!)
    expect(byes).toHaveLength(6)
    // El BYE queda balanceado (3 primeros, 3 segundos), no todo para los 1ros.
    expect(byes.filter(c => c.pos === 1)).toHaveLength(3)
    expect(byes.filter(c => c.pos === 2)).toHaveLength(3)
    // El cabeza de serie #1 sigue teniendo prioridad para el BYE.
    expect(byes.some(c => c.grupoIdx === 0 && c.pos === 1)).toBe(true)
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
        expect(m.a!.pos).not.toBe(m.b!.pos) // nunca 1°vs1° ni 2°vs2°
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

  it('reparte el BYE balanceado entre primeros y segundos de grupo', () => {
    for (let numGrupos = 2; numGrupos <= 32; numGrupos++) {
      const { matches } = construirLlavesLayout(numGrupos)
      const tamano = calcularTamanoBracket(numGrupos * 2)
      const byesEsperados = tamano - numGrupos * 2
      const byes = matches.filter(m => m.a && !m.b).map(m => m.a!)
      expect(byes).toHaveLength(byesEsperados)
      const byesPrimeros = byes.filter(s => s.pos === 1).length
      const byesSegundos = byes.filter(s => s.pos === 2).length
      // El BYE se reparte para igualar cuántos 1ros y 2dos juegan (nunca
      // 2°vs2°). Sin cabezas de serie el reparto por mitades es simétrico,
      // así que a lo más difieren en 1 (cuando numGrupos es impar).
      expect(Math.abs(byesPrimeros - byesSegundos)).toBeLessThanOrEqual(1)
    }
  })

  it('prioriza BYE para cabezas de serie, salvo que evitar 2°vs2° lo impida', () => {
    // 3 grupos → bracket de 8 → solo 2 BYEs en total. El cabeza #1 lo recibe,
    // pero el cabeza #2 queda solo en una mitad de 1 grupo: darle BYE ahí
    // dejaría a los 2dos restantes jugando entre ellos, así que juega. Evitar
    // 2°vs2° pesa más que proteger a un cabeza de serie (igual que pide el
    // negocio: es un objetivo, no una regla absoluta).
    const tres = construirLlavesLayout(3, { grupoIdx: 0, pos: 1 }, { grupoIdx: 1, pos: 1 })
    const byesTres = tres.matches.filter(m => !m.b).map(m => `${m.a!.grupoIdx}:${m.a!.pos}`)
    expect(byesTres).toContain('0:1')
    expect(tres.matches.filter(m => m.a && m.b).every(m => m.a!.pos !== m.b!.pos)).toBe(true)

    // 5 grupos → bracket de 16 → 6 BYEs, hay margen de sobra: ambos cabezas
    // reciben BYE sin sacrificar el balance 1°vs2°.
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

// ─── rankearClasificados ──────────────────────────────────────────────────
// El orden con que se reparte el BYE del cuadro. Antes de esto el BYE se
// decidía por el balance de mitades del bracket, no por rendimiento.

describe('rankearClasificados', () => {
  function clasificado(over: Partial<ClasificadoConStats> & { jugadorId: string }): ClasificadoConStats {
    return {
      grupoIdx: 0,
      posicion: 1,
      victorias: 0,
      setsFavor: 0,
      setsContra: 0,
      cabezaNumero: null,
      ...over,
    }
  }
  const ids = (r: ClasificadoConStats[]) => r.map(c => c.jugadorId)

  it('con victorias y sets iguales, desempata el mejor ratio de puntos', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'justo', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 2, puntosFavor: 90, puntosContra: 80 }),
      clasificado({ jugadorId: 'contundente', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 2, puntosFavor: 90, puntosContra: 55 }),
    ])
    expect(ids(orden)).toEqual(['contundente', 'justo'])
  })

  it('sin puntos cargados (partidos viejos) el orden no se rompe', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'b', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 4 }),
      clasificado({ jugadorId: 'a', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 1 }),
    ])
    expect(ids(orden)).toEqual(['a', 'b'])
  })

  it('el ratio de sets manda por sobre el de puntos', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'muchospuntos', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 4, puntosFavor: 200, puntosContra: 100 }),
      clasificado({ jugadorId: 'mejorsets', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 1, puntosFavor: 70, puntosContra: 65 }),
    ])
    expect(ids(orden)).toEqual(['mejorsets', 'muchospuntos'])
  })

  it('con las mismas victorias, desempata el mejor ratio de sets', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'flojo', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 4 }),
      clasificado({ jugadorId: 'solido', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 1 }),
    ])
    expect(ids(orden)).toEqual(['solido', 'flojo'])
  })

  it('manda la cantidad de victorias por sobre el ratio', () => {
    // Limitación conocida y aceptada (misma que el estándar ITTF de
    // referencia): en grupos de distinto tamaño las victorias no son
    // comparables. El de un grupo de 3 gana 2 partidos; el de un grupo de 2
    // gana 1 y con ratio perfecto, e igual queda detrás.
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'grupoDe2', grupoIdx: 1, victorias: 1, setsFavor: 3, setsContra: 0 }),
      clasificado({ jugadorId: 'grupoDe3', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 4 }),
    ])
    expect(ids(orden)).toEqual(['grupoDe3', 'grupoDe2'])
  })

  it('ningún 2° pasa por encima de un 1°, por mejor que haya rendido', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'segundoImpecable', grupoIdx: 0, posicion: 2, victorias: 3, setsFavor: 9, setsContra: 0 }),
      clasificado({ jugadorId: 'primeroJusto', grupoIdx: 1, posicion: 1, victorias: 1, setsFavor: 3, setsContra: 2 }),
    ])
    expect(ids(orden)).toEqual(['primeroJusto', 'segundoImpecable'])
  })

  it('un clasificado sin marcador (dato anterior a la migración 216) queda al fondo, no arriba', () => {
    // 0 sets a favor y 0 en contra es 0/0. Si eso diera Infinity o NaN, un
    // torneo viejo pondría a cualquiera de cabeza del cuadro.
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'sinMarcador', grupoIdx: 0, victorias: 2, setsFavor: 0, setsContra: 0 }),
      clasificado({ jugadorId: 'conMarcador', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 5 }),
    ])
    expect(ids(orden)).toEqual(['conMarcador', 'sinMarcador'])
    expect(orden.every(c => Number.isFinite(c.setsFavor) && Number.isFinite(c.setsContra))).toBe(true)
  })

  it('el invicto sin sets en contra va antes que el invicto que cedió sets', () => {
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'cedioUno', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 1 }),
      clasificado({ jugadorId: 'perfecto', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 0 }),
    ])
    expect(ids(orden)).toEqual(['perfecto', 'cedioUno'])
  })

  it('empatados en todo: desempata la cabeza de serie y después es determinístico', () => {
    const empatados = [
      clasificado({ jugadorId: 'zzz', grupoIdx: 0, victorias: 2, setsFavor: 6, setsContra: 2 }),
      clasificado({ jugadorId: 'aaa', grupoIdx: 1, victorias: 2, setsFavor: 6, setsContra: 2 }),
      clasificado({ jugadorId: 'mmm', grupoIdx: 2, victorias: 2, setsFavor: 6, setsContra: 2, cabezaNumero: 1 }),
    ]
    expect(ids(rankearClasificados(empatados))).toEqual(['mmm', 'aaa', 'zzz'])
    // Mismo input dos veces → mismo orden. Sin esto el cuadro podría salir
    // distinto en cada sincronización.
    expect(ids(rankearClasificados(empatados))).toEqual(ids(rankearClasificados(empatados)))
  })

  it('no muta el arreglo que recibe', () => {
    const entrada = [
      clasificado({ jugadorId: 'b', grupoIdx: 0, victorias: 1 }),
      clasificado({ jugadorId: 'a', grupoIdx: 1, victorias: 2 }),
    ]
    rankearClasificados(entrada)
    expect(ids(entrada)).toEqual(['b', 'a'])
  })

  it('regresión: el 1° que ganó todo no puede quedar debajo de un 2°, que es lo que pasaba con el BYE por mitades', () => {
    // Escenario reportado: un 2° de grupo recibía BYE mientras un 1° con mejor
    // rendimiento jugaba la primera ronda, porque el BYE se repartía por qué
    // mitad del cuadro necesitaba descartar gente.
    const orden = rankearClasificados([
      clasificado({ jugadorId: 'segundoConSuerte', grupoIdx: 2, posicion: 2, victorias: 1, setsFavor: 4, setsContra: 3 }),
      clasificado({ jugadorId: 'primeroInvicto', grupoIdx: 0, posicion: 1, victorias: 2, setsFavor: 6, setsContra: 0 }),
      clasificado({ jugadorId: 'otroPrimero', grupoIdx: 1, posicion: 1, victorias: 2, setsFavor: 6, setsContra: 3 }),
    ])
    expect(ids(orden)).toEqual(['primeroInvicto', 'otroPrimero', 'segundoConSuerte'])
  })
})

// ─── calcularStatsGrupo: sets ─────────────────────────────────────────────

describe('calcularStatsGrupo con marcador', () => {
  it('suma sets a favor y en contra a los dos jugadores', () => {
    const js = jugadores(2)
    const { stats } = calcularStatsGrupo(js, [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 1 },
    ])
    const j0 = stats.find(s => s.jugadorId === 'j0')!
    const j1 = stats.find(s => s.jugadorId === 'j1')!
    expect([j0.sf, j0.sc]).toEqual([3, 1])
    expect([j1.sf, j1.sc]).toEqual([1, 3])
  })

  it('un partido sin marcador cuenta para pg/pp pero no mueve los sets', () => {
    const js = jugadores(2)
    const { stats } = calcularStatsGrupo(js, [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0' },
    ])
    const j0 = stats.find(s => s.jugadorId === 'j0')!
    expect(j0.pg).toBe(1)
    expect([j0.sf, j0.sc]).toEqual([0, 0])
  })

  it('suma los puntos totales del partido a los dos jugadores', () => {
    const { stats } = calcularStatsGrupo(jugadores(2), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 1, puntosA: 44, puntosB: 38 },
    ])
    const j0 = stats.find(s => s.jugadorId === 'j0')!
    const j1 = stats.find(s => s.jugadorId === 'j1')!
    expect([j0.pf, j0.pc]).toEqual([44, 38])
    expect([j1.pf, j1.pc]).toEqual([38, 44])
  })

  it('un partido con sets pero sin puntos (cargado antes de la 225) no mueve los puntos', () => {
    const { stats } = calcularStatsGrupo(jugadores(2), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 0 },
    ])
    const j0 = stats.find(s => s.jugadorId === 'j0')!
    expect([j0.sf, j0.sc]).toEqual([3, 0])
    expect([j0.pf, j0.pc]).toEqual([0, 0])
  })
})

// ─── Desempate de tres o más ──────────────────────────────────────────────
// El caso clásico del grupo de 3 donde cada uno gana uno: antes siempre iba al
// juez. Ahora lo resuelve el ratio de sets y, si eso también empata, el de
// puntos. Solo queda manual cuando ni los puntos separan.

describe('desempate de tres por sets y puntos', () => {
  it('el ratio de sets ordena el triángulo sin intervención manual', () => {
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadores(3), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1', setsA: 3, setsB: 2 },
      { jugadorA: 'j2', jugadorB: 'j0', ganador: 'j2', setsA: 3, setsB: 2 },
    ])
    // j0: 5 sets a favor, 3 en contra. j2: 5 a 5. j1: 3 a 5.
    expect(hayTripleEmpate).toBe(false)
    expect(stats.map(s => s.jugadorId)).toEqual(['j0', 'j2', 'j1'])
  })

  it('con los sets empatados manda el ratio de puntos', () => {
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadores(3), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 1, puntosA: 44, puntosB: 30 },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1', setsA: 3, setsB: 1, puntosA: 44, puntosB: 40 },
      { jugadorA: 'j2', jugadorB: 'j0', ganador: 'j2', setsA: 3, setsB: 1, puntosA: 44, puntosB: 42 },
    ])
    // Todos 4-4 en sets. Puntos: j0 86-74, j1 74-84, j2 84-86.
    expect(hayTripleEmpate).toBe(false)
    expect(stats.map(s => s.jugadorId)).toEqual(['j0', 'j2', 'j1'])
  })

  it('si ni los puntos separan a los dos primeros, sigue yendo al juez', () => {
    const { hayTripleEmpate } = calcularStatsGrupo(jugadores(3), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 1, puntosA: 44, puntosB: 40 },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1', setsA: 3, setsB: 1, puntosA: 44, puntosB: 40 },
      { jugadorA: 'j2', jugadorB: 'j0', ganador: 'j2', setsA: 3, setsB: 1, puntosA: 44, puntosB: 40 },
    ])
    expect(hayTripleEmpate).toBe(true)
  })

  it('desempata solo entre los empatados, no con los partidos contra el resto', () => {
    // j0 gana el grupo. j1, j2 y j3 empatan a 1 victoria; entre ellos j1 arrasa,
    // pero su paliza contra j0 no puede contar (no está en el empate).
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadores(4), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 2 },
      { jugadorA: 'j0', jugadorB: 'j2', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j0', jugadorB: 'j3', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1', setsA: 3, setsB: 0 },
      { jugadorA: 'j2', jugadorB: 'j3', ganador: 'j2', setsA: 3, setsB: 2 },
      { jugadorA: 'j3', jugadorB: 'j1', ganador: 'j3', setsA: 3, setsB: 2 },
    ])
    // Entre los tres: j1 5-3, j3 5-5, j2 3-5.
    expect(hayTripleEmpate).toBe(false)
    expect(stats.map(s => s.jugadorId)).toEqual(['j0', 'j1', 'j3', 'j2'])
  })

  it('un empate a tres por el tercer puesto no bloquea el grupo', () => {
    // j0 y j1 tienen los dos cupos resueltos; el triángulo es por el 3°.
    const { hayTripleEmpate } = calcularStatsGrupo(jugadores(5), [
      { jugadorA: 'j0', jugadorB: 'j1', ganador: 'j0', setsA: 3, setsB: 1 },
      { jugadorA: 'j0', jugadorB: 'j2', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j0', jugadorB: 'j3', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j0', jugadorB: 'j4', ganador: 'j0', setsA: 3, setsB: 0 },
      { jugadorA: 'j1', jugadorB: 'j2', ganador: 'j1', setsA: 3, setsB: 0 },
      { jugadorA: 'j1', jugadorB: 'j3', ganador: 'j1', setsA: 3, setsB: 0 },
      { jugadorA: 'j1', jugadorB: 'j4', ganador: 'j1', setsA: 3, setsB: 0 },
      { jugadorA: 'j2', jugadorB: 'j3', ganador: 'j2', setsA: 3, setsB: 0 },
      { jugadorA: 'j3', jugadorB: 'j4', ganador: 'j3', setsA: 3, setsB: 0 },
      { jugadorA: 'j4', jugadorB: 'j2', ganador: 'j4', setsA: 3, setsB: 0 },
    ])
    expect(hayTripleEmpate).toBe(false)
  })
})

// ─── construirBracketPorRanking ───────────────────────────────────────────
// El armado del cuadro que reemplaza a construirBracketPorGruposNumerado.

describe('construirBracketPorRanking', () => {
  // Helper: rankeado por mérito ya ordenado. gi = grupoIdx, pos = 1|2.
  function rk(jugadorId: string, gi: number, pos: 1 | 2): RankeadoParaBracket {
    return { jugadorId, nombre: jugadorId.toUpperCase(), grupoIdx: gi, posicion: pos }
  }

  // Reconstruye las llaves iniciales (pares de la ronda). Un partido con
  // jugadorB null es un BYE.
  type Llave = { a: string; b: string | null; bye: boolean }
  function llaves(partidos: ReturnType<typeof construirBracketPorRanking>): Llave[] {
    return partidos.map(p => ({ a: p.jugadorA, b: p.jugadorB, bye: p.jugadorB == null }))
  }
  const grupoDe = (rankeados: RankeadoParaBracket[]) =>
    new Map(rankeados.map(r => [r.jugadorId, r.grupoIdx]))

  it('sin choques posibles: coincide con el sembrado estándar y no hay pares del mismo grupo', () => {
    // 4 grupos, todos distintos → el sembrado nunca cruza un grupo consigo mismo.
    const rankeados = [
      rk('a1', 0, 1), rk('b1', 1, 1), rk('c1', 2, 1), rk('d1', 3, 1),
      rk('a2', 0, 2), rk('b2', 1, 2), rk('c2', 2, 2), rk('d2', 3, 2),
    ]
    const gmap = grupoDe(rankeados)
    const bracket = construirBracketPorRanking(rankeados)
    for (const ll of llaves(bracket)) {
      if (!ll.bye && ll.b) expect(gmap.get(ll.a)).not.toBe(gmap.get(ll.b))
    }
    // Cuadro de 8: 8 clasificados, sin BYE, 4 llaves completas.
    expect(bracket).toHaveLength(4)
    expect(bracket.every(p => p.jugadorB != null)).toBe(true)
  })

  it('choque de grupo forzado: ninguna llave inicial queda con dos del mismo grupo', () => {
    // 6 clasificados de 3 grupos → cuadro de 8, 2 BYE. Ordenados a propósito
    // para que el 1° y el 2° de un grupo caigan juntos si no se corrige.
    const rankeados = [
      rk('a1', 0, 1), rk('b1', 1, 1), rk('c1', 2, 1),
      rk('a2', 0, 2), rk('b2', 1, 2), rk('c2', 2, 2),
    ]
    const gmap = grupoDe(rankeados)
    const bracket = construirBracketPorRanking(rankeados)
    for (const ll of llaves(bracket)) {
      if (!ll.bye && ll.b) expect(gmap.get(ll.a)).not.toBe(gmap.get(ll.b))
    }
  })

  it('el BYE cae siempre en los N mejores del ranking, antes y después de resolver choques', () => {
    const rankeados = [
      rk('a1', 0, 1), rk('b1', 1, 1), rk('c1', 2, 1),
      rk('a2', 0, 2), rk('b2', 1, 2), rk('c2', 2, 2),
    ]
    const tam = 8
    const nBye = tam - rankeados.length // 2 BYE
    const mejoresN = new Set(rankeados.slice(0, nBye).map(r => r.jugadorId))
    const bracket = construirBracketPorRanking(rankeados)
    const conBye = bracket.filter(p => p.jugadorB == null).map(p => p.jugadorA)
    expect(conBye).toHaveLength(nBye)
    for (const id of conBye) expect(mejoresN.has(id)).toBe(true)
  })

  it('seed 1 y seed 2 quedan en llaves distintas: solo pueden cruzarse en la final', () => {
    const rankeados = [
      rk('a1', 0, 1), rk('b1', 1, 1), rk('c1', 2, 1), rk('d1', 3, 1),
      rk('a2', 0, 2), rk('b2', 1, 2), rk('c2', 2, 2), rk('d2', 3, 2),
    ]
    const bracket = construirBracketPorRanking(rankeados)
    // seed 1 = a1, seed 2 = b1. No pueden estar en la misma llave inicial.
    const llaveDe = (id: string) => bracket.findIndex(p => p.jugadorA === id || p.jugadorB === id)
    expect(llaveDe('a1')).not.toBe(llaveDe('b1'))
  })

  it('caso límite de 2 grupos (4 clasificados): arma el cuadro sin romperse', () => {
    const rankeados = [rk('a1', 0, 1), rk('b1', 1, 1), rk('a2', 0, 2), rk('b2', 1, 2)]
    const gmap = grupoDe(rankeados)
    const bracket = construirBracketPorRanking(rankeados)
    expect(bracket).toHaveLength(2) // cuadro de 4, 2 semis
    for (const ll of llaves(bracket)) {
      if (!ll.bye && ll.b) expect(gmap.get(ll.a)).not.toBe(gmap.get(ll.b))
    }
  })

  it('menos de 2 clasificados no genera partidos', () => {
    expect(construirBracketPorRanking([])).toEqual([])
    expect(construirBracketPorRanking([{ jugadorId: 'x', nombre: 'X', grupoIdx: 0, posicion: 1 }])).toEqual([])
  })

  it('cada jugador aparece exactamente una vez en el cuadro', () => {
    const rankeados = [
      rk('a1', 0, 1), rk('b1', 1, 1), rk('c1', 2, 1),
      rk('a2', 0, 2), rk('b2', 1, 2), rk('c2', 2, 2),
    ]
    const bracket = construirBracketPorRanking(rankeados)
    const apariciones = bracket.flatMap(p => [p.jugadorA, p.jugadorB]).filter(Boolean)
    expect(new Set(apariciones).size).toBe(rankeados.length)
  })
})

// ─── calcularCuadroProgresivo ─────────────────────────────────────────────
// Qué llaves se pueden jugar aunque falten grupos por cerrar.

// ─── Siembra tradicional: cabezas en las esquinas ─────────────────────────
// Acordado con el club (2026-08-24): las cabezas de serie ocupan las esquinas
// del cuadro por su NÚMERO, no por cómo les fue en grupos, y descansan las de
// número más bajo. El resto va por mérito. Antes el mérito ordenaba a todos, y
// con las cabezas rindiendo parejo terminaban las cinco en la misma mitad.

describe('siembra tradicional (cabezas ancladas)', () => {
  function cl(
    jugadorId: string, grupoIdx: number, posicion: 1 | 2,
    victorias: number, setsFavor: number, setsContra: number,
    cabezaNumero: number | null = null,
  ): ClasificadoConStats {
    return { jugadorId, grupoIdx, posicion, victorias, setsFavor, setsContra, cabezaNumero }
  }

  // Torneo real de Buin del 2026-08-24: 7 grupos, 14 clasificados. Las cabezas
  // cargadas fueron 1 a 7; la #3 (Rodrigo) quedó eliminada en el grupo C, así
  // que al cuadro entran 1, 2, 4, 5, 6 y 7. Es el caso que motivó el cambio.
  const buin: ClasificadoConStats[] = [
    cl('Benjamin', 0, 1, 2, 6, 2, 1), cl('matias', 0, 2, 1, 3, 5),
    cl('Joaquin', 1, 1, 2, 6, 0, 2), cl('gaspar', 1, 2, 1, 3, 4),
    cl('kojiro', 2, 1, 2, 6, 0), cl('green', 2, 2, 1, 3, 3),
    cl('shushatumadre', 3, 1, 2, 6, 0), cl('spider', 3, 2, 1, 3, 3, 4),
    cl('kast', 4, 1, 2, 6, 0), cl('beatriz', 4, 2, 1, 3, 3, 5),
    cl('garcez', 5, 1, 2, 6, 0, 6), cl('maria', 5, 2, 1, 3, 3),
    cl('luis', 6, 1, 2, 6, 0, 7), cl('yulissa', 6, 2, 1, 3, 5),
  ]

  // Reparte los slots del layout en mitad de arriba / mitad de abajo.
  function mitades(clasificados: ClasificadoConStats[]) {
    const { matches } = construirLayoutPorRanking(clasificados)
    const quien = new Map(clasificados.map(c => [`${c.grupoIdx}:${c.posicion}`, c.jugadorId]))
    const nombre = (s: { grupoIdx: number; pos: number } | null) =>
      s ? quien.get(`${s.grupoIdx}:${s.pos}`)! : null
    const arriba: string[] = []
    const abajo: string[] = []
    matches.forEach((m, i) => {
      const destino = i < matches.length / 2 ? arriba : abajo
      for (const n of [nombre(m.a), nombre(m.b)]) if (n) destino.push(n)
    })
    return { arriba, abajo, matches }
  }

  it('regresión Buin: las cabezas no quedan todas en la misma mitad', () => {
    const { arriba, abajo } = mitades(buin)
    const cabezas = ['Benjamin', 'spider', 'beatriz', 'garcez', 'luis']
    const arribaCab = cabezas.filter(c => arriba.includes(c))
    const abajoCab = cabezas.filter(c => abajo.includes(c))
    // El bug reportado: las 5 cabezas en la mitad de abajo.
    expect(arribaCab.length).toBeGreaterThan(0)
    expect(abajoCab.length).toBeGreaterThan(0)
  })

  it('el BYE lo reciben las cabezas de número más bajo, no el mejor mérito', () => {
    const { matches } = mitades(buin)
    const quien = new Map(buin.map(c => [`${c.grupoIdx}:${c.posicion}`, c.jugadorId]))
    const conBye = matches
      .filter(m => (m.a && !m.b) || (m.b && !m.a))
      .map(m => quien.get(`${(m.a ?? m.b)!.grupoIdx}:${(m.a ?? m.b)!.pos}`)!)
    // CS1 y CS2 son las dos cabezas más bajas que clasificaron. kast y garcez
    // rindieron igual o mejor (2-0, 6-0 en sets) pero el BYE ya no se decide
    // por mérito. Coincide con el cuadro real del 24-08.
    expect(conBye.sort()).toEqual(['Benjamin', 'Joaquin'])
  })

  it('la cabeza 1 y la cabeza 2 caen en mitades opuestas', () => {
    const dos = [
      cl('cs1', 0, 1, 2, 6, 0, 1), cl('a2', 0, 2, 1, 3, 3),
      cl('cs2', 1, 1, 2, 6, 0, 2), cl('b2', 1, 2, 1, 3, 3),
      cl('c1', 2, 1, 2, 6, 0), cl('c2', 2, 2, 1, 3, 3),
      cl('d1', 3, 1, 2, 6, 0), cl('d2', 3, 2, 1, 3, 3),
    ]
    const { arriba, abajo } = mitades(dos)
    expect(arriba.includes('cs1')).toBe(!arriba.includes('cs2'))
    expect(abajo.includes('cs1')).toBe(!abajo.includes('cs2'))
  })

  it('ninguna llave inicial enfrenta a dos del mismo grupo', () => {
    const { matches } = construirLayoutPorRanking(buin)
    for (const m of matches) {
      if (m.a && m.b) expect(m.a.grupoIdx).not.toBe(m.b.grupoIdx)
    }
  })

  it('sin cabezas de serie sigue mandando el mérito puro', () => {
    const sinCabezas = buin.map(c => ({ ...c, cabezaNumero: null }))
    const { matches } = construirLayoutPorRanking(sinCabezas)
    const quien = new Map(sinCabezas.map(c => [`${c.grupoIdx}:${c.posicion}`, c.jugadorId]))
    const conBye = matches
      .filter(m => (m.a && !m.b) || (m.b && !m.a))
      .map(m => quien.get(`${(m.a ?? m.b)!.grupoIdx}:${(m.a ?? m.b)!.pos}`)!)
    // Los dos mejores 1ros por sets: todos 2-0, desempata el ratio. Sin
    // cabezas nadie está anclado, así que el BYE vuelve a ser por rendimiento.
    expect(conBye).toHaveLength(2)
    expect(conBye.every(n => sinCabezas.find(c => c.jugadorId === n)!.posicion === 1)).toBe(true)
  })

  it('un ganador de grupo no enfrenta a otro ganador si hay un 2° para cruzar', () => {
    // Con 7 grupos y 2 byes quedan 5 ganadores libres contra 7 segundos: las
    // llaves 2°vs2° sobran sí o sí, pero las de 1°vs1° no tienen por qué
    // existir. La siembra pura igual las armaba (seeds 8 y 9 son vecinos).
    const { matches } = construirLayoutPorRanking(buin)
    const nivel = new Map(buin.map(c => [`${c.grupoIdx}:${c.posicion}`, c.posicion]))
    const pares = matches
      .filter(m => m.a && m.b)
      .map(m => [nivel.get(`${m.a!.grupoIdx}:${m.a!.pos}`)!, nivel.get(`${m.b!.grupoIdx}:${m.b!.pos}`)!])
    expect(pares.filter(([x, y]) => x === 1 && y === 1)).toHaveLength(0)
    // Y el sobrante de segundos es exactamente uno, no más.
    expect(pares.filter(([x, y]) => x === 2 && y === 2)).toHaveLength(1)
  })

  it('es determinístico: mismos datos, mismo cuadro', () => {
    const a = construirLayoutPorRanking(buin)
    const b = construirLayoutPorRanking(buin)
    expect(a).toEqual(b)
  })
})
