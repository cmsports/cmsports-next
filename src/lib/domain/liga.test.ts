import { describe, it, expect } from 'vitest'
import {
  generarFixtureDivision,
  esResultadoBo5Valido,
  determinarGanadorBo5,
  calcularRankingDivision,
  validarMovimientoPartido,
  programarDivision,
  fechasRecomendadas,
  puedeJugarEnBloque,
  generarBloquesHorario,
  BLOQUE_INICIO,
  BLOQUE_FIN,
  type PartidoFinalizado,
  type PartidoExistente,
  type RestriccionDisponibilidad,
} from './liga'

describe('fixture round-robin', () => {
  it('generarFixtureDivision numera el orden correlativo', () => {
    const f = generarFixtureDivision(['a', 'b', 'c'])
    expect(f).toHaveLength(3)
    expect(f.map(p => p.orden)).toEqual([0, 1, 2])
  })
})

describe('resultados Bo5', () => {
  it('acepta solo marcadores válidos de mejor de 5', () => {
    for (const [a, b] of [[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3]]) {
      expect(esResultadoBo5Valido(a, b)).toBe(true)
    }
  })
  it('rechaza marcadores inválidos', () => {
    for (const [a, b] of [[3, 3], [2, 2], [4, 0], [3, 3], [0, 0], [1, 2]]) {
      expect(esResultadoBo5Valido(a, b)).toBe(false)
    }
  })
  it('determina el ganador por quién llegó a 3', () => {
    expect(determinarGanadorBo5(3, 1, 'A', 'B')).toBe('A')
    expect(determinarGanadorBo5(2, 3, 'A', 'B')).toBe('B')
  })
})

describe('calcularRankingDivision', () => {
  const p = (aId: string, bId: string, ganadorId: string, setsA: number, setsB: number): PartidoFinalizado => ({
    jugadorAId: aId, jugadorBId: bId, ganadorId, esWalkover: false, setsA, setsB,
  })

  it('victoria = 3 pts, derrota = 1 pt, y ordena por puntos', () => {
    const filas = calcularRankingDivision(['A', 'B', 'C'], [
      p('A', 'B', 'A', 3, 1),
      p('A', 'C', 'A', 3, 0),
      p('B', 'C', 'B', 3, 2),
    ])
    expect(filas[0].jugadorId).toBe('A')
    expect(filas[0].pts).toBe(6)
    expect(filas[0].sf).toBe(6)
    expect(filas[0].sc).toBe(1)
    expect(filas[0].ds).toBe(5)
    expect(filas.map(f => f.jugadorId)).toEqual(['A', 'B', 'C'])
  })

  it('walkover: el perdedor suma 0 pts y no se cuentan sets', () => {
    const filas = calcularRankingDivision(['A', 'B'], [
      { jugadorAId: 'A', jugadorBId: 'B', ganadorId: 'A', esWalkover: true, setsA: null, setsB: null },
    ])
    const a = filas.find(f => f.jugadorId === 'A')!
    const b = filas.find(f => f.jugadorId === 'B')!
    expect(a.pts).toBe(3)
    expect(b.pts).toBe(0)
    expect(a.sf).toBe(0)
    expect(b.pp).toBe(1)
  })

  it('desempata por diferencia de sets cuando hay igualdad de puntos', () => {
    // Ciclo A>B, B>C, C>A: todos 4 pts y 1 PG, se ordenan por DS
    const filas = calcularRankingDivision(['A', 'B', 'C'], [
      p('A', 'B', 'A', 3, 2),
      p('B', 'C', 'B', 3, 0),
      p('C', 'A', 'C', 3, 0),
    ])
    expect(filas.map(f => f.jugadorId)).toEqual(['B', 'C', 'A'])
  })
})

describe('validarMovimientoPartido', () => {
  const base: PartidoExistente = {
    id: 'p1', fechaId: 'f1', mesaId: 'm1', bloqueHorario: '09:00',
    jugadorAId: 'A', jugadorBId: 'B', arbitroId: null,
  }
  const destino = { fechaId: 'f1', mesaId: 'm1', bloqueHorario: '09:00' }

  it('permite mover a una mesa/bloque libre', () => {
    expect(validarMovimientoPartido(base, destino, [base]).valido).toBe(true)
  })
  it('rechaza si la mesa ya está ocupada en ese bloque', () => {
    const otro: PartidoExistente = { ...base, id: 'p2', jugadorAId: 'C', jugadorBId: 'D' }
    const r = validarMovimientoPartido(base, destino, [base, otro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/mesa/i)
  })
  it('rechaza si un jugador ya juega en ese bloque en otra mesa', () => {
    const otro: PartidoExistente = { ...base, id: 'p2', mesaId: 'm2', jugadorAId: 'A', jugadorBId: 'D' }
    const r = validarMovimientoPartido(base, destino, [otro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/jugador/i)
  })
  it('rechaza si el árbitro es uno de los jugadores', () => {
    const conArbitro = { ...base, arbitroId: 'A' }
    const r = validarMovimientoPartido(conArbitro, destino, [conArbitro])
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/árbitro/i)
  })
})

// La razón de ser de estos tests: en producción salieron horarios donde un
// jugador jugaba 10:00 y después 14:30. El reparto por fecha armaba conjuntos
// de partidos que NO admiten ningún orden válido, y el ordenador heurístico
// emitía igual el "menos malo". Ahora el reparto verifica factibilidad antes
// de aceptar cada partido, así que la regla es una garantía, no un objetivo.
describe('programarDivision — garantía de hueco máximo', () => {
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, 30)

  function programar(nJugadores: number, numFechas: number) {
    const jugadorIds = Array.from({ length: nJugadores }, (_, i) => `J${i}`)
    const partidos = generarFixtureDivision(jugadorIds).map(f => ({
      id: `${f.jugadorA}-${f.jugadorB}`,
      divisionId: 'D1',
      jugadorAId: f.jugadorA,
      jugadorBId: f.jugadorB,
      ordenFixture: f.orden,
    }))
    const r = programarDivision(partidos, jugadorIds, numFechas, bloques, 1)
    return { ...r, totalPartidos: partidos.length }
  }

  // Posiciones (índice de bloque) de cada jugador dentro de cada fecha.
  function posicionesPorFecha(programados: ReturnType<typeof programar>['programados']) {
    const idxBloque = new Map(bloques.map((b, i) => [b, i]))
    const porFecha = new Map<number, Map<string, number[]>>()
    for (const p of programados) {
      if (!porFecha.has(p.fechaNumero)) porFecha.set(p.fechaNumero, new Map())
      const mapa = porFecha.get(p.fechaNumero)!
      for (const j of [p.jugadorAId, p.jugadorBId]) {
        if (!mapa.has(j)) mapa.set(j, [])
        mapa.get(j)!.push(idxBloque.get(p.bloqueHorario)!)
      }
    }
    for (const mapa of porFecha.values()) for (const arr of mapa.values()) arr.sort((a, b) => a - b)
    return porFecha
  }

  const casos: Array<[number, number]> = [
    [6, 5], [8, 5], [10, 5], [11, 5], [12, 5], [13, 5], [15, 5], [16, 5], [20, 5],
    [8, 3], [12, 3], [12, 4], [15, 6], [12, 8],
  ]

  it.each(casos)('con %i jugadores y %i fechas ningún jugador espera más de 1 partido', (n, fechas) => {
    const { programados } = programar(n, fechas)
    for (const [fechaNumero, porJugador] of posicionesPorFecha(programados)) {
      for (const [jugador, pos] of porJugador) {
        for (let k = 1; k < pos.length; k++) {
          const hueco = pos[k] - pos[k - 1] - 1
          expect(hueco, `fecha ${fechaNumero}, jugador ${jugador}, posiciones ${pos.join(',')}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it.each(casos)('con %i jugadores y %i fechas nadie juega dos partidos a la misma hora', (n, fechas) => {
    const { programados } = programar(n, fechas)
    for (const [fechaNumero, porJugador] of posicionesPorFecha(programados)) {
      for (const [jugador, pos] of porJugador) {
        expect(new Set(pos).size, `fecha ${fechaNumero}, jugador ${jugador}`).toBe(pos.length)
      }
    }
  })

  it.each(casos)('con %i jugadores y %i fechas no se pierde ni se duplica ningún partido', (n, fechas) => {
    const { programados, sinAsignar, totalPartidos } = programar(n, fechas)
    expect(programados.length + sinAsignar.length).toBe(totalPartidos)
    const ids = [...programados.map(p => p.id), ...sinAsignar.map(p => p.id)]
    expect(new Set(ids).size).toBe(totalPartidos)
  })

  it('un mismo bloque de una fecha no se asigna a dos partidos', () => {
    const { programados } = programar(12, 5)
    const ocupados = new Set<string>()
    for (const p of programados) {
      const clave = `${p.fechaNumero}::${p.bloqueHorario}`
      expect(ocupados.has(clave), `bloque repetido: ${clave}`).toBe(false)
      ocupados.add(clave)
    }
  })

  it('es determinista: dos corridas con la misma entrada dan el mismo horario', () => {
    const serializar = (r: ReturnType<typeof programar>) =>
      r.programados.map(p => `${p.fechaNumero}|${p.bloqueHorario}|${p.id}`).join('\n')
    expect(serializar(programar(12, 5))).toBe(serializar(programar(12, 5)))
  })

  it('ningún jugador supera los 3 partidos en una misma fecha', () => {
    const { programados } = programar(12, 5)
    for (const [fechaNumero, porJugador] of posicionesPorFecha(programados)) {
      for (const [jugador, pos] of porJugador) {
        expect(pos.length, `fecha ${fechaNumero}, jugador ${jugador}`).toBeLessThanOrEqual(3)
      }
    }
  })

  // La fecha de ajuste es para que el admin patee partidos a mano cuando pasa
  // algo, NO para que el algoritmo deje afuera lo que no supo acomodar. Si los
  // bloques alcanzan, se programa todo.
  describe('no manda partidos al reajuste si hay capacidad', () => {
    const conCapacidad = casos.filter(([n, fechas]) => {
      const totalPartidos = (n * (n - 1)) / 2
      return fechas * bloques.length >= totalPartidos
    })

    it.each(conCapacidad)('%i jugadores en %i fechas: todos los partidos quedan programados', (n, fechas) => {
      const { sinAsignar, programados, totalPartidos } = programar(n, fechas)
      expect(sinAsignar, `quedaron ${sinAsignar.length} sin programar`).toHaveLength(0)
      expect(programados).toHaveLength(totalPartidos)
    })

    it('el caso que falló en producción (12 jugadores, 5 fechas) programa los 66', () => {
      const { programados, sinAsignar } = programar(12, 5)
      expect(sinAsignar).toHaveLength(0)
      expect(programados).toHaveLength(66)
    })
  })
})

// Lo único que importa de esta función: si dice que con X fechas alcanza,
// tiene que alcanzar de verdad. Se verifica corriendo el programador real.
describe('fechasRecomendadas', () => {
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, 30)

  const tamaños = Array.from({ length: 17 }, (_, i) => i + 4) // 4 a 20 jugadores

  it.each(tamaños)('con %i jugadores por división, las fechas que recomienda alcanzan para programar todo', n => {
    const regulares = fechasRecomendadas(n, bloques.length) - 1 // la última es de ajuste
    const jugadorIds = Array.from({ length: n }, (_, i) => `J${i}`)
    const partidos = generarFixtureDivision(jugadorIds).map(f => ({
      id: `${f.jugadorA}-${f.jugadorB}`,
      divisionId: 'D1',
      jugadorAId: f.jugadorA,
      jugadorBId: f.jugadorB,
      ordenFixture: f.orden,
    }))
    const { programados, sinAsignar } = programarDivision(partidos, jugadorIds, regulares, bloques, 1)
    expect(sinAsignar, `quedaron ${sinAsignar.length} sin programar con ${regulares} fechas regulares`).toHaveLength(0)
    expect(programados).toHaveLength(partidos.length)
  })

  it('reserva siempre una fecha de ajuste además de las necesarias para jugar', () => {
    // 6 jugadores = 15 partidos, entran de sobra en una fecha de 16 bloques,
    // pero igual hacen falta 2 de juego por el ritmo de cada jugador, +1 de ajuste.
    expect(fechasRecomendadas(6, 16)).toBe(3)
  })

  it('crece cuando la mesa no da abasto', () => {
    // Con bloques de una hora entran 8 partidos por fecha en vez de 16.
    expect(fechasRecomendadas(12, 8)).toBeGreaterThan(fechasRecomendadas(12, 16))
  })

  it('devuelve un mínimo razonable con entradas inválidas', () => {
    expect(fechasRecomendadas(0, 16)).toBe(2)
    expect(fechasRecomendadas(1, 16)).toBe(2)
    expect(fechasRecomendadas(12, 0)).toBe(2)
  })
})

// Las restricciones son un constraint duro, igual que el hueco máximo: si un
// jugador avisó que no puede, el horario NO lo pone ahí. Si eso deja partidos
// afuera, se avisan — nunca se programa igual.
describe('programarDivision — restricciones de disponibilidad', () => {
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, 30)

  function programarCon(n: number, numFechas: number, restricciones: RestriccionDisponibilidad[]) {
    const jugadorIds = Array.from({ length: n }, (_, i) => `J${i}`)
    const partidos = generarFixtureDivision(jugadorIds).map(f => ({
      id: `${f.jugadorA}-${f.jugadorB}`,
      divisionId: 'D1',
      jugadorAId: f.jugadorA,
      jugadorBId: f.jugadorB,
      ordenFixture: f.orden,
    }))
    const r = programarDivision(partidos, jugadorIds, numFechas, bloques, 1, restricciones)
    return { ...r, totalPartidos: partidos.length }
  }

  /** Ningún partido programado puede caer en un bloque vedado para sus jugadores. */
  function violaciones(
    programados: ReturnType<typeof programarCon>['programados'],
    restricciones: RestriccionDisponibilidad[],
  ) {
    const malas: string[] = []
    for (const p of programados) {
      for (const j of [p.jugadorAId, p.jugadorBId]) {
        if (!puedeJugarEnBloque(restricciones, j, p.fechaNumero, p.bloqueHorario)) {
          malas.push(`${j} en fecha ${p.fechaNumero} bloque ${p.bloqueHorario}`)
        }
      }
    }
    return malas
  }

  const soloManana = (jugadores: string[]): RestriccionDisponibilidad[] =>
    jugadores.map(j => ({ jugadorId: j, fechaNumero: null, horaDesde: null, horaHasta: '12:00' }))

  it('respeta que un jugador no pueda ir a una fecha entera', () => {
    const restr: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: 3, horaDesde: null, horaHasta: null },
    ]
    const { programados } = programarCon(12, 5, restr)
    expect(violaciones(programados, restr)).toEqual([])
    const enFecha3 = programados.filter(
      p => p.fechaNumero === 3 && (p.jugadorAId === 'J0' || p.jugadorBId === 'J0'),
    )
    expect(enFecha3).toHaveLength(0)
  })

  it('respeta que un jugador sólo pueda en la mañana, en todas las fechas', () => {
    const restr = soloManana(['J0'])
    const { programados } = programarCon(12, 5, restr)
    expect(violaciones(programados, restr)).toEqual([])
    for (const p of programados) {
      if (p.jugadorAId === 'J0' || p.jugadorBId === 'J0') {
        expect(p.bloqueHorario <= '12:00', `J0 quedó a las ${p.bloqueHorario}`).toBe(true)
      }
    }
  })

  it('respeta que un jugador sólo pueda por la tarde', () => {
    const restr: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: null, horaDesde: '12:00', horaHasta: null },
    ]
    const { programados } = programarCon(12, 5, restr)
    expect(violaciones(programados, restr)).toEqual([])
    for (const p of programados) {
      if (p.jugadorAId === 'J0' || p.jugadorBId === 'J0') {
        expect(p.bloqueHorario >= '12:00', `J0 quedó a las ${p.bloqueHorario}`).toBe(true)
      }
    }
  })

  it('aguanta varios jugadores con restricciones mezcladas sin romper ninguna', () => {
    const restr: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: 3, horaDesde: null, horaHasta: null },
      { jugadorId: 'J1', fechaNumero: 5, horaDesde: null, horaHasta: null },
      { jugadorId: 'J2', fechaNumero: null, horaDesde: '12:00', horaHasta: null },
      { jugadorId: 'J3', fechaNumero: null, horaDesde: null, horaHasta: '13:00' },
      { jugadorId: 'J4', fechaNumero: 2, horaDesde: null, horaHasta: null },
      { jugadorId: 'J4', fechaNumero: 4, horaDesde: null, horaHasta: null },
    ]
    const { programados } = programarCon(12, 5, restr)
    expect(violaciones(programados, restr)).toEqual([])
  })

  it('sigue cumpliendo el hueco máximo con restricciones puestas', () => {
    const restr: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: null, horaDesde: '12:00', horaHasta: null },
      { jugadorId: 'J1', fechaNumero: null, horaDesde: null, horaHasta: '13:00' },
      { jugadorId: 'J2', fechaNumero: 3, horaDesde: null, horaHasta: null },
    ]
    const { programados } = programarCon(12, 5, restr)
    const idxBloque = new Map(bloques.map((b, i) => [b, i]))
    const porFecha = new Map<number, Map<string, number[]>>()
    for (const p of programados) {
      if (!porFecha.has(p.fechaNumero)) porFecha.set(p.fechaNumero, new Map())
      const mapa = porFecha.get(p.fechaNumero)!
      for (const j of [p.jugadorAId, p.jugadorBId]) {
        if (!mapa.has(j)) mapa.set(j, [])
        mapa.get(j)!.push(idxBloque.get(p.bloqueHorario)!)
      }
    }
    for (const [fechaNumero, porJugador] of porFecha) {
      for (const [jugador, pos] of porJugador) {
        pos.sort((a, b) => a - b)
        for (let k = 1; k < pos.length; k++) {
          expect(pos[k] - pos[k - 1] - 1, `fecha ${fechaNumero}, ${jugador}: ${pos.join(',')}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('cuando una restricción deja partidos afuera, dice cuál y por culpa de quién', () => {
    // Media división sólo por la mañana: los partidos entre ellos no caben todos.
    const restr = soloManana(['J0', 'J1', 'J2', 'J3', 'J4', 'J5'])
    const { programados, sinAsignar, totalPartidos } = programarCon(12, 5, restr)
    expect(violaciones(programados, restr)).toEqual([])
    expect(sinAsignar.length).toBeGreaterThan(0)
    expect(programados.length + sinAsignar.length).toBe(totalPartidos)
    for (const s of sinAsignar) {
      expect(s.motivo).toBe('restriccion')
      expect(s.jugadoresConRestriccion.length).toBeGreaterThan(0)
    }
    // Margen explícito: este caso es el más pesado del archivo (~3s) y con el
    // timeout por defecto de 5s fallaba de a ratos al correr todo el suite.
  }, 30_000)

  it('sin restricciones programa exactamente igual que antes', () => {
    const sin = programarCon(12, 5, [])
    expect(sin.sinAsignar).toHaveLength(0)
    expect(sin.programados).toHaveLength(66)
  })

  it('no se cuelga con restricciones muy duras', () => {
    const restr = soloManana(['J0', 'J1', 'J2', 'J3', 'J4', 'J5'])
    const t0 = Date.now()
    programarCon(12, 5, restr)
    expect(Date.now() - t0).toBeLessThan(15_000)
  }, 30_000)
})

// Al reprogramar a mitad de liga sólo quedan disponibles las fechas que no se
// jugaron. Si ya pasaron la 1, 2 y 3, hay que repartir en la 4, 5 y 6 — y las
// restricciones hablan de ESOS números, no de "la primera fecha libre". Que se
// corriera el número era el error fácil de cometer acá.
describe('programarDivision — reprogramar sólo las fechas que faltan', () => {
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, 30)

  function programarEn(n: number, fechas: number | number[], restricciones: RestriccionDisponibilidad[] = []) {
    const jugadorIds = Array.from({ length: n }, (_, i) => `J${i}`)
    const partidos = generarFixtureDivision(jugadorIds).map(f => ({
      id: `${f.jugadorA}-${f.jugadorB}`,
      divisionId: 'D1',
      jugadorAId: f.jugadorA,
      jugadorBId: f.jugadorB,
      ordenFixture: f.orden,
    }))
    return programarDivision(partidos, jugadorIds, fechas, bloques, 1, restricciones)
  }

  it('usa los números de fecha reales que se le pasan, no 1..N', () => {
    const { programados } = programarEn(8, [4, 5, 6])
    const usadas = [...new Set(programados.map(p => p.fechaNumero))].sort((a, b) => a - b)
    expect(usadas).toEqual([4, 5, 6])
  })

  it('aplica la restricción al número real de fecha', () => {
    // J0 no puede la fecha 5. Si el motor numerara las disponibles como 1,2,3,
    // esta restricción no engancharía con ninguna y J0 jugaría igual.
    const restr: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: 5, horaDesde: null, horaHasta: null },
    ]
    const { programados } = programarEn(8, [4, 5, 6], restr)
    const enLa5 = programados.filter(
      p => p.fechaNumero === 5 && (p.jugadorAId === 'J0' || p.jugadorBId === 'J0'),
    )
    expect(enLa5).toHaveLength(0)
    // Y sigue jugando en las otras dos.
    const enOtras = programados.filter(p => p.jugadorAId === 'J0' || p.jugadorBId === 'J0')
    expect(enOtras.length).toBeGreaterThan(0)
  })

  it('pasar un número es lo mismo que pasar 1..N', () => {
    const clave = (r: ReturnType<typeof programarEn>) =>
      r.programados.map(p => `${p.fechaNumero}|${p.bloqueHorario}|${p.id}`).sort().join('\n')
    expect(clave(programarEn(10, 4))).toBe(clave(programarEn(10, [1, 2, 3, 4])))
  })

  it('sin fechas disponibles no programa nada y lo dice', () => {
    const { programados, sinAsignar } = programarEn(6, [])
    expect(programados).toHaveLength(0)
    expect(sinAsignar).toHaveLength(15)
    expect(sinAsignar[0].motivo).toBe('sin_espacio')
  })

  it('respeta el hueco máximo también en las fechas rearmadas', () => {
    const { programados } = programarEn(10, [3, 4, 5])
    const idxBloque = new Map(bloques.map((b, i) => [b, i]))
    const porFecha = new Map<number, Map<string, number[]>>()
    for (const p of programados) {
      if (!porFecha.has(p.fechaNumero)) porFecha.set(p.fechaNumero, new Map())
      const mapa = porFecha.get(p.fechaNumero)!
      for (const j of [p.jugadorAId, p.jugadorBId]) {
        if (!mapa.has(j)) mapa.set(j, [])
        mapa.get(j)!.push(idxBloque.get(p.bloqueHorario)!)
      }
    }
    for (const [fechaNumero, porJugador] of porFecha) {
      for (const [jugador, pos] of porJugador) {
        pos.sort((a, b) => a - b)
        for (let k = 1; k < pos.length; k++) {
          expect(pos[k] - pos[k - 1] - 1, `fecha ${fechaNumero}, ${jugador}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('puedeJugarEnBloque', () => {
  it('sin restricciones puede siempre', () => {
    expect(puedeJugarEnBloque([], 'J0', 1, '09:00')).toBe(true)
  })

  it('fecha bloqueada entera: no puede en ningún bloque de esa fecha', () => {
    const r: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: 3, horaDesde: null, horaHasta: null },
    ]
    expect(puedeJugarEnBloque(r, 'J0', 3, '09:00')).toBe(false)
    expect(puedeJugarEnBloque(r, 'J0', 3, '16:00')).toBe(false)
    expect(puedeJugarEnBloque(r, 'J0', 2, '09:00')).toBe(true) // otra fecha sí
    expect(puedeJugarEnBloque(r, 'J1', 3, '09:00')).toBe(true) // otro jugador sí
  })

  it('fechaNumero null aplica a todas las fechas', () => {
    const r: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: null, horaDesde: '12:00', horaHasta: null },
    ]
    expect(puedeJugarEnBloque(r, 'J0', 1, '11:30')).toBe(false)
    expect(puedeJugarEnBloque(r, 'J0', 5, '11:30')).toBe(false)
    expect(puedeJugarEnBloque(r, 'J0', 5, '12:00')).toBe(true)
  })

  it('el borde del rango es inclusivo', () => {
    const r: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: null, horaDesde: '12:00', horaHasta: '14:00' },
    ]
    expect(puedeJugarEnBloque(r, 'J0', 1, '12:00')).toBe(true)
    expect(puedeJugarEnBloque(r, 'J0', 1, '14:00')).toBe(true)
    expect(puedeJugarEnBloque(r, 'J0', 1, '11:30')).toBe(false)
    expect(puedeJugarEnBloque(r, 'J0', 1, '14:30')).toBe(false)
  })

  it('varias restricciones del mismo jugador se acumulan', () => {
    const r: RestriccionDisponibilidad[] = [
      { jugadorId: 'J0', fechaNumero: 2, horaDesde: null, horaHasta: null },
      { jugadorId: 'J0', fechaNumero: null, horaDesde: '12:00', horaHasta: null },
    ]
    expect(puedeJugarEnBloque(r, 'J0', 2, '13:00')).toBe(false) // fecha 2 vedada
    expect(puedeJugarEnBloque(r, 'J0', 1, '11:00')).toBe(false) // antes de las 12
    expect(puedeJugarEnBloque(r, 'J0', 1, '13:00')).toBe(true)
  })
})
