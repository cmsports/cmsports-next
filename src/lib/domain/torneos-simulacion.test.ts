import { describe, it, expect } from 'vitest'
import {
  calcularNumGrupos,
  generarRoundRobin,
  seedingSerpenteo,
  calcularStatsGrupo,
  generarBracketConAvance,
  generarSiguienteFase,
  construirLlavesLayout,
  calcularTamanoBracket,
  determinarFaseInicial,
  siguienteFase,
  type JugadorTorneo,
  type PartidoGenerado,
} from './torneos'

// ─── Helpers ──────────────────────────────────────────────────────────────

function crearJugadores(n: number): JugadorTorneo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `j${String(i + 1).padStart(2, '0')}`,
    nombre: `Jugador ${i + 1}`,
  }))
}

function numId(id: string): number {
  return parseInt(id.replace('j', ''))
}

function simularPartidosGrupo(
  _jugadores: JugadorTorneo[],
  partidos: Array<[string, string]>,
): Array<{ jugadorA: string; jugadorB: string; ganador: string }> {
  return partidos.map(([a, b]) => {
    // Mayor número de ID = más fuerte
    const ganador = numId(a) > numId(b) ? a : b
    return { jugadorA: a, jugadorB: b, ganador }
  })
}

// ─── Simulación completa: 48 jugadores ────────────────────────────────────

describe('Simulación torneo 48 jugadores', () => {
  const TOTAL_INICIALES = 48
  const jugadores = crearJugadores(TOTAL_INICIALES)
  const cabeza1 = jugadores[47] // j48 — el más fuerte
  const cabeza2 = jugadores[46] // j47 — segundo más fuerte
  const cabezasDeSerie = new Set([cabeza1.id, cabeza2.id])

  // Paso 1: Calcular grupos
  const numGrupos = calcularNumGrupos(TOTAL_INICIALES)

  // Prioridad dura: grupos de 3. 48 es múltiplo exacto de 3, así que da 16
  // grupos parejos de 3 sin necesitar ningún grupo de 2, y de paso el cuadro
  // de 32 clasificados queda exacto (sin BYEs) — sirve para probar el resto
  // de la mecánica del bracket sin el ruido de los BYEs.
  it('genera 16 grupos de 3 para 48 jugadores', () => {
    expect(numGrupos).toBe(16)
  })

  // Paso 2: Distribuir con serpenteo
  const asignaciones = seedingSerpenteo(jugadores, numGrupos, cabezasDeSerie)

  it('asigna exactamente 48 jugadores sin duplicados', () => {
    expect(asignaciones).toHaveLength(48)
    const ids = new Set(asignaciones.map(a => a.jugadorId))
    expect(ids.size).toBe(48)
  })

  it('los grupos difieren en a lo más 1 jugador', () => {
    const counts = Array(numGrupos).fill(0)
    asignaciones.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('cabezas de serie caen en grupos distintos', () => {
    const g1 = asignaciones.find(a => a.jugadorId === cabeza1.id)!.grupoIndex
    const g2 = asignaciones.find(a => a.jugadorId === cabeza2.id)!.grupoIndex
    expect(g1).not.toBe(g2)
  })

  // Paso 3: Armar grupos y round-robin
  const grupos: { id: string; jugadores: JugadorTorneo[] }[] = []
  for (let g = 0; g < numGrupos; g++) {
    const ids = asignaciones.filter(a => a.grupoIndex === g).map(a => a.jugadorId)
    const jugs = ids.map(id => jugadores.find(j => j.id === id)!)
    grupos.push({ id: `grupo_${String.fromCharCode(65 + g)}`, jugadores: jugs })
  }

  it('cada grupo tiene 3-4 jugadores, nunca 2', () => {
    for (const g of grupos) {
      expect(g.jugadores.length).toBeGreaterThanOrEqual(3)
      expect(g.jugadores.length).toBeLessThanOrEqual(4)
    }
  })

  // Paso 4: Simular partidos de grupo
  const resultadosGrupo: Map<string, ReturnType<typeof calcularStatsGrupo>> = new Map()
  const todoMatchesGrupo: Array<{ jugadorA: string; jugadorB: string; ganador: string; grupoId: string }> = []

  for (const g of grupos) {
    const pares = generarRoundRobin(g.jugadores.map(j => j.id))
    const resultados = simularPartidosGrupo(g.jugadores, pares)
    todoMatchesGrupo.push(...resultados.map(r => ({ ...r, grupoId: g.id })))
    const stats = calcularStatsGrupo(g.jugadores, resultados)
    resultadosGrupo.set(g.id, stats)
  }

  it('todos los partidos de grupo se jugaron', () => {
    // Grupos de 3: 3 partidos, Grupos de 2: 1 partido
    const esperados = grupos.reduce((sum, g) => {
      const n = g.jugadores.length
      return sum + (n * (n - 1)) / 2
    }, 0)
    expect(todoMatchesGrupo.length).toBe(esperados)
  })

  it('ningún grupo tiene triple empate (con el modelo determinista)', () => {
    for (const [, stats] of resultadosGrupo) {
      expect(stats.hayTripleEmpate).toBe(false)
    }
  })

  // Paso 5: Obtener clasificados (1° y 2° por grupo)
  const primeros: JugadorTorneo[] = []
  const segundos: JugadorTorneo[] = []
  const cabeza1GrupoIdx = asignaciones.find(a => a.jugadorId === cabeza1.id)!.grupoIndex
  const cabeza2GrupoIdx = asignaciones.find(a => a.jugadorId === cabeza2.id)!.grupoIndex

  for (let g = 0; g < numGrupos; g++) {
    const stats = resultadosGrupo.get(grupos[g].id)!
    primeros.push(stats.stats[0].jugador)
    segundos.push(stats.stats[1].jugador)
  }

  it('se clasifican exactamente 32 jugadores (16 grupos × 2)', () => {
    expect(primeros.length).toBe(16)
    expect(segundos.length).toBe(16)
    const todosClasificados = [...primeros, ...segundos]
    expect(new Set(todosClasificados.map(j => j.id)).size).toBe(32)
  })

  it('cabezas de serie clasifican como primeros de su grupo', () => {
    expect(primeros[cabeza1GrupoIdx].id).toBe(cabeza1.id)
    expect(primeros[cabeza2GrupoIdx].id).toBe(cabeza2.id)
  })

  // Paso 6: Generar bracket con regla espejo
  const bracket = generarBracketConAvance(primeros, segundos, cabeza1.id, cabeza2.id)
  const tamBracket = calcularTamanoBracket(primeros.length + segundos.length)
  const faseInicial = determinarFaseInicial(tamBracket)

  // La frontera entre las dos mitades sale del propio cuadro. Estaba fijada en
  // 16 —correcto solo para un cuadro de 64— y al cambiar el reparto de grupos
  // rompía por el número, no porque la regla espejo fallara.
  const mitadDe = (orden: number) => (orden < bracket.length / 2 ? 'sup' : 'inf')

  it('bracket tiene tamaño 32 (32 clasificados, potencia de 2 exacta)', () => {
    expect(tamBracket).toBe(32)
  })

  it('fase inicial es 16vos', () => {
    expect(faseInicial).toBe('16vos')
  })

  it('bracket genera 16 partidos (32/2)', () => {
    expect(bracket.length).toBe(16)
  })

  it('no hay ni un BYE: los 32 clasificados llenan el cuadro', () => {
    const conBye = bracket.filter(p => p.jugadorB === null)
    const sinBye = bracket.filter(p => p.jugadorB !== null)
    expect(conBye.length).toBe(0)
    expect(sinBye.length).toBe(16)
  })

  it('cabezas de serie en mitades opuestas del bracket', () => {
    const matchC1 = bracket.find(p => p.jugadorA === cabeza1.id)
    const matchC2 = bracket.find(p => p.jugadorA === cabeza2.id)
    expect(matchC1).toBeDefined()
    expect(matchC2).toBeDefined()
    expect(mitadDe(matchC1!.orden)).not.toBe(mitadDe(matchC2!.orden))
  })

  it('regla espejo: 1° y 2° del mismo grupo en mitades opuestas', () => {
    for (let g = 0; g < numGrupos; g++) {
      const p1 = primeros[g]
      const p2 = segundos[g]
      const posP1 = bracket.find(p => p.jugadorA === p1.id || p.jugadorB === p1.id)!
      const posP2 = bracket.find(p => p.jugadorA === p2.id || p.jugadorB === p2.id)!
      expect(mitadDe(posP1.orden)).not.toBe(mitadDe(posP2.orden))
    }
  })

  it('ningún jugador aparece dos veces en el bracket', () => {
    const ids = bracket.flatMap(p => [p.jugadorA, p.jugadorB]).filter(Boolean) as string[]
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Paso 7: Simular el bracket completo hasta la final
  it('el bracket se juega completo hasta un campeón, cabezas llegan a la final', () => {
    const byId = new Map(jugadores.map(j => [j.id, j]))

    function pickGanador(p: PartidoGenerado): JugadorTorneo {
      if (p.ganador) return byId.get(p.ganador)!
      const idA = p.jugadorA
      const idB = p.jugadorB!
      // Cabezas siempre ganan; resto gana el de mayor número
      if (idA === cabeza1.id || idA === cabeza2.id) return byId.get(idA)!
      if (idB === cabeza1.id || idB === cabeza2.id) return byId.get(idB)!
      return byId.get(numId(idA) > numId(idB) ? idA : idB)!
    }

    let partidosRonda = bracket
    let fase = faseInicial as string
    const fasesJugadas: string[] = []

    while (partidosRonda.length > 0) {
      fasesJugadas.push(fase)
      const ganadores = partidosRonda.map(pickGanador)

      if (fase === 'final') {
        expect(ganadores).toHaveLength(1)
        const finalMatch = partidosRonda[0]
        const finalistas = [finalMatch.jugadorA, finalMatch.jugadorB].sort()
        expect(finalistas).toEqual([cabeza1.id, cabeza2.id].sort())
        break
      }

      const sig = siguienteFase(fase as any)
      expect(sig).not.toBeNull()
      partidosRonda = generarSiguienteFase(ganadores, fase as any)
      fase = sig!
    }

    expect(fasesJugadas).toContain('final')
  })

  // Paso 8: Layout incremental (construirLlavesLayout)
  it('layout incremental es consistente con el bracket', () => {
    const layout = construirLlavesLayout(numGrupos, cabeza1GrupoIdx, cabeza2GrupoIdx)
    expect(layout.faseInicial).toBe(faseInicial)

    // Todos los cupos presentes
    const slots = layout.matches.flatMap(m => [m.a, m.b]).filter(Boolean)
    expect(slots.length).toBe(numGrupos * 2) // 32 clasificados
  })

  // ─── Paso 9: Jugadores tardíos ──────────────────────────────────────────

  describe('3 jugadores tardíos', () => {
    const tardios = crearJugadores(51).slice(48) // j49, j50, j51

    it('se crea un nuevo grupo con los 3 tardíos', () => {
      // Simula generarGruposTardios: 3+ jugadores → nuevo grupo
      const nuevoGrupoIdx = numGrupos // grupo Q (índice 16)
      const nuevoGrupo = {
        id: `grupo_${String.fromCharCode(65 + nuevoGrupoIdx)}`,
        jugadores: tardios,
      }

      const pares = generarRoundRobin(tardios.map(j => j.id))
      expect(pares).toHaveLength(3) // 3 jugadores → 3 partidos

      // Simular y obtener stats
      const resultados = simularPartidosGrupo(tardios, pares)
      const stats = calcularStatsGrupo(tardios, resultados)
      expect(stats.hayTripleEmpate).toBe(false)

      const primeroTardio = stats.stats[0].jugador
      const segundoTardio = stats.stats[1].jugador
      expect(primeroTardio.id).toBe('j51') // el más fuerte gana todo
      expect(segundoTardio.id).toBe('j50')
    })

    it('mover jugador tardío a grupo sin partidos jugados', () => {
      // Simula: crear grupo nuevo, luego mover 1 jugador a un grupo existente
      // que no haya jugado (resetear round robin de ambos)

      // Creamos un escenario donde el grupo A no ha jugado todavía
      const grupoA = grupos[0]
      const jugadorAMover = tardios[0] // j49

      // Pre-move: grupo A tiene sus jugadores originales
      const jugadoresAntes = grupoA.jugadores.map(j => j.id)
      expect(jugadoresAntes).not.toContain(jugadorAMover.id)

      // Post-move: grupo A tendría un jugador más
      const jugadoresDespues = [...grupoA.jugadores, jugadorAMover]
      const paresNuevos = generarRoundRobin(jugadoresDespues.map(j => j.id))

      // Con 4 jugadores: 6 partidos (4*3/2)
      if (grupoA.jugadores.length === 3) {
        expect(jugadoresDespues.length).toBe(4)
        expect(paresNuevos).toHaveLength(6)
      }
    })

    it('bracket se regenera correctamente con 17 grupos (16+1 tardío)', () => {
      // Simula el bracket con el grupo extra
      const numGruposConTardios = numGrupos + 1 // 17

      // Agregar clasificados del grupo tardío
      const primerosTodos = [...primeros, { id: 'j51', nombre: 'Jugador 51' }]
      const segundosTodos = [...segundos, { id: 'j50', nombre: 'Jugador 50' }]

      const totalClasificados = primerosTodos.length + segundosTodos.length
      expect(totalClasificados).toBe(34) // 17×2

      // Un grupo tardío desbalancea el cuadro: 34 clasificados no caben en 32 y
      // saltan a 64, con 30 BYEs. Es exactamente el caso que la ronda de avance
      // viene a resolver.
      const tamNuevo = calcularTamanoBracket(totalClasificados)
      expect(tamNuevo).toBe(64)

      const bracketNuevo = generarBracketConAvance(
        primerosTodos, segundosTodos, cabeza1.id, cabeza2.id
      )

      const conBye = bracketNuevo.filter(p => p.jugadorB === null)
      const sinBye = bracketNuevo.filter(p => p.jugadorB !== null)
      expect(conBye.length).toBe(30)
      expect(sinBye.length).toBe(2) // 34-30=4 jugadores en 2 partidos reales

      // BYEs tienen ganador automático
      expect(conBye.every(p => p.ganador != null)).toBe(true)

      // Sin duplicados
      const ids = bracketNuevo.flatMap(p => [p.jugadorA, p.jugadorB]).filter(Boolean) as string[]
      expect(new Set(ids).size).toBe(ids.length)

      // Cabezas siguen en mitades opuestas
      const posC1 = bracketNuevo.find(p => p.jugadorA === cabeza1.id)!
      const posC2 = bracketNuevo.find(p => p.jugadorA === cabeza2.id)!
      expect(posC1).toBeDefined()
      expect(posC2).toBeDefined()
      expect(posC1.orden < 16 ? 'sup' : 'inf').not.toBe(posC2.orden < 16 ? 'sup' : 'inf')

      // Regla espejo se mantiene para los 18 grupos
      for (let g = 0; g < numGruposConTardios; g++) {
        const p1 = primerosTodos[g]
        const p2 = segundosTodos[g]
        const matchP1 = bracketNuevo.find(p => p.jugadorA === p1.id || p.jugadorB === p1.id)!
        const matchP2 = bracketNuevo.find(p => p.jugadorA === p2.id || p.jugadorB === p2.id)!
        const mitadP1 = matchP1.orden < 16 ? 'sup' : 'inf'
        const mitadP2 = matchP2.orden < 16 ? 'sup' : 'inf'
        expect(mitadP1).not.toBe(mitadP2)
      }
    })

    it('bracket con tardíos llega a la final correctamente', () => {
      const primerosTodos = [...primeros, { id: 'j51', nombre: 'Jugador 51' }]
      const segundosTodos = [...segundos, { id: 'j50', nombre: 'Jugador 50' }]
      const todosJugadores = [...jugadores, ...crearJugadores(51).slice(48)]
      const byId = new Map(todosJugadores.map(j => [j.id, j]))

      function pickGanador(p: PartidoGenerado): JugadorTorneo {
        if (p.ganador) return byId.get(p.ganador)!
        const idA = p.jugadorA
        const idB = p.jugadorB!
        if (idA === cabeza1.id || idA === cabeza2.id) return byId.get(idA)!
        if (idB === cabeza1.id || idB === cabeza2.id) return byId.get(idB)!
        return byId.get(numId(idA) > numId(idB) ? idA : idB)!
      }

      const bracketNuevo = generarBracketConAvance(
        primerosTodos, segundosTodos, cabeza1.id, cabeza2.id
      )

      let partidosRonda = bracketNuevo
      let fase = determinarFaseInicial(64) as string
      let rondas = 0

      while (partidosRonda.length > 0 && rondas < 10) {
        rondas++
        const ganadores = partidosRonda.map(pickGanador)

        if (fase === 'final') {
          expect(ganadores).toHaveLength(1)
          const f = partidosRonda[0]
          expect([f.jugadorA, f.jugadorB].sort()).toEqual([cabeza1.id, cabeza2.id].sort())
          break
        }

        const sig = siguienteFase(fase as any)
        expect(sig).not.toBeNull()
        partidosRonda = generarSiguienteFase(ganadores, fase as any)
        fase = sig!
      }

      // 32vos → 16vos → 8vos → cuartos → semis → final = 6 rondas
      expect(rondas).toBe(6)
    })
  })

  // ─── Paso 10: Verificar la prellave (BYEs avanzan) ──────────────────────

  describe('prellave / BYEs', () => {
    // El cuadro principal de esta simulación ya no tiene BYEs: 48 jugadores
    // arman 16 grupos y sus 32 clasificados llenan un cuadro de 32 exacto.
    // Para seguir probando la mecánica del BYE se usa un escenario que sí los
    // produce —17 grupos, 34 clasificados en un cuadro de 64—, que es
    // justamente el caso que la ronda de avance tiene que venir a reemplazar.
    const primeros17 = [...primeros, { id: 'j51', nombre: 'Jugador 51' }]
    const segundos17 = [...segundos, { id: 'j50', nombre: 'Jugador 50' }]
    const bracketConByes = generarBracketConAvance(
      primeros17, segundos17, cabeza1.id, cabeza2.id,
    )

    it('jugadores con BYE avanzan automáticamente a la siguiente ronda', () => {
      const byeMatches = bracketConByes.filter(p => p.jugadorB === null)
      // Todos tienen ganador = jugadorA
      expect(byeMatches.every(p => p.ganador === p.jugadorA)).toBe(true)
      expect(byeMatches.length).toBeGreaterThan(0)
    })

    it('los cabezas de serie reciben BYE (son los sembrados más fuertes)', () => {
      // 34 jugadores en bracket 64 = 30 BYEs. Los 2 cabezas (sembrados 1 y 2)
      // reciben BYE y avanzan automáticamente.
      const matchCabeza1 = bracketConByes.find(p => p.jugadorA === cabeza1.id)
      const matchCabeza2 = bracketConByes.find(p => p.jugadorA === cabeza2.id)
      expect(matchCabeza1).toBeDefined()
      expect(matchCabeza2).toBeDefined()
      expect(matchCabeza1!.jugadorB).toBeNull()
      expect(matchCabeza1!.ganador).toBe(cabeza1.id)
      expect(matchCabeza2!.jugadorB).toBeNull()
      expect(matchCabeza2!.ganador).toBe(cabeza2.id)
    })

    it('en 16vos todos los que tenían BYE ya tienen rival', () => {
      const byeGanadores = bracketConByes.filter(p => p.ganador).map(p => p.ganador!)
      const sinByeGanadores = bracketConByes.filter(p => !p.ganador && p.jugadorB).map(p => {
        // Simular: gana el de mayor número
        const numA = parseInt(p.jugadorA.replace('j', ''))
        const numB = parseInt(p.jugadorB!.replace('j', ''))
        return numA > numB ? p.jugadorA : p.jugadorB!
      })

      const todosGanadores32vos = [...byeGanadores, ...sinByeGanadores]
      const jugadoresObj = todosGanadores32vos.map(id =>
        jugadores.find(j => j.id === id) || { id, nombre: id }
      )

      const siguiente = generarSiguienteFase(jugadoresObj, '32vos')
      // 32 ganadores → 16 partidos en 16vos
      expect(siguiente).toHaveLength(16)
      // Ningún partido de 16vos tiene BYE
      expect(siguiente.every(p => p.jugadorB !== null)).toBe(true)
    })
  })

  // ─── Paso 11: 1° vs 2° de grupos diferentes ────────────────────────────

  describe('cruces 1° vs 2°', () => {
    it('en primera ronda, ningún 1° juega contra el 2° de su propio grupo', () => {
      const grupoDeJugador = new Map<string, number>()
      for (let g = 0; g < numGrupos; g++) {
        grupoDeJugador.set(primeros[g].id, g)
        grupoDeJugador.set(segundos[g].id, g)
      }

      const partidosReales = bracket.filter(p => p.jugadorB !== null)
      for (const p of partidosReales) {
        const gA = grupoDeJugador.get(p.jugadorA)
        const gB = grupoDeJugador.get(p.jugadorB!)
        if (gA !== undefined && gB !== undefined) {
          expect(gA).not.toBe(gB)
        }
      }
    })
  })
})
