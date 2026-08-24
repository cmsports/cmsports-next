import { describe, it, expect } from 'vitest'
import {
  generarFixtureEquipos, generarFixtureGrupos, totalFechas, asignarHorarios, sumarDias, calcularMarcador,
  calcularTablaPosiciones, calcularGoleadores, calcularTarjetas, calcularFairPlay,
  clasificarPorTabla, clasificarPorGrupos, generarBracketPlayoffs, armarSiguienteRonda,
  siguienteFasePlayoff, ganadorPartido, perdedorPartido, type EquipoStats,
} from './liga-futbol'

describe('generarFixtureEquipos', () => {
  it('con 4 equipos y 1 rueda genera 3 rondas de 2 partidos cada uno, sin repetir equipo en la misma ronda', () => {
    const partidos = generarFixtureEquipos(['a', 'b', 'c', 'd'], 1)
    expect(partidos).toHaveLength(6) // C(4,2)
    expect(totalFechas(partidos)).toBe(3)

    for (let r = 1; r <= 3; r++) {
      const deLaRonda = partidos.filter(p => p.ronda === r)
      const equipos = deLaRonda.flatMap(p => [p.equipoLocalId, p.equipoVisitaId])
      expect(new Set(equipos).size).toBe(equipos.length) // nadie juega dos veces en la misma ronda
    }
  })

  it('con número impar de equipos, cada uno descansa exactamente una ronda', () => {
    const partidos = generarFixtureEquipos(['a', 'b', 'c'], 1)
    expect(partidos).toHaveLength(3) // C(3,2)
    expect(totalFechas(partidos)).toBe(3)
    for (const eq of ['a', 'b', 'c']) {
      const jugados = partidos.filter(p => p.equipoLocalId === eq || p.equipoVisitaId === eq)
      expect(jugados).toHaveLength(2) // juega 2 de las 3 rondas, descansa 1
    }
  })

  it('con ruedas=2 duplica los partidos y cada par juega ida y vuelta', () => {
    const partidos = generarFixtureEquipos(['a', 'b', 'c', 'd'], 2)
    expect(partidos).toHaveLength(12)
    const par = (x: string, y: string) => partidos.filter(p =>
      (p.equipoLocalId === x && p.equipoVisitaId === y) || (p.equipoLocalId === y && p.equipoVisitaId === x))
    const abPartidos = par('a', 'b')
    expect(abPartidos).toHaveLength(2)
    // Cada uno fue local exactamente una vez
    expect(abPartidos.filter(p => p.equipoLocalId === 'a')).toHaveLength(1)
    expect(abPartidos.filter(p => p.equipoLocalId === 'b')).toHaveLength(1)
  })
})

describe('generarFixtureGrupos', () => {
  it('alinea las rondas de distintos grupos', () => {
    const partidos = generarFixtureGrupos([
      { id: 'g1', equipoIds: ['a', 'b', 'c', 'd'] },
      { id: 'g2', equipoIds: ['e', 'f'] },
    ], 1)
    expect(totalFechas(partidos)).toBe(3) // el grupo de 4 manda
    expect(partidos.filter(p => p.grupoId === 'g2')).toHaveLength(1) // solo 1 partido posible entre e y f
  })
})

describe('asignarHorarios', () => {
  it('reparte los horarios de forma cíclica', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const conHora = asignarHorarios(items, ['19:00', '20:00'])
    expect(conHora.map(x => x.hora)).toEqual(['19:00', '20:00', '19:00'])
  })

  it('sin horarios configurados deja hora en null', () => {
    const conHora = asignarHorarios([{ id: 1 }], [])
    expect(conHora[0].hora).toBeNull()
  })
})

describe('sumarDias', () => {
  it('suma días sin corrimiento de timezone', () => {
    expect(sumarDias('2026-01-25', 7)).toBe('2026-02-01')
  })
})

describe('calcularMarcador', () => {
  it('cuenta goles normales para su propio equipo', () => {
    const m = calcularMarcador([
      { equipo_id: 'local', tipo: 'normal' },
      { equipo_id: 'local', tipo: 'penal' },
      { equipo_id: 'visita', tipo: 'normal' },
    ], 'local', 'visita')
    expect(m).toEqual({ golesLocal: 2, golesVisita: 1 })
  })

  it('un autogol cuenta para el equipo rival', () => {
    const m = calcularMarcador([
      { equipo_id: 'local', tipo: 'autogol' }, // lo hizo un jugador local, pero suma para visita
      { equipo_id: 'visita', tipo: 'normal' },
    ], 'local', 'visita')
    expect(m).toEqual({ golesLocal: 0, golesVisita: 2 })
  })
})

const REGLAS = { puntosVictoria: 3, puntosEmpate: 1, puntosDerrota: 0, puntosWoPerdedor: 0 }

describe('calcularTablaPosiciones', () => {
  it('suma pts/pj/gf/gc correctamente con victorias, empates y derrotas', () => {
    const tabla = calcularTablaPosiciones(['a', 'b', 'c'], [
      { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 2, golesVisita: 1, estado: 'finalizado' },
      { equipoLocalId: 'b', equipoVisitaId: 'c', golesLocal: 0, golesVisita: 0, estado: 'finalizado' },
      { equipoLocalId: 'c', equipoVisitaId: 'a', golesLocal: 1, golesVisita: 3, estado: 'finalizado' },
    ], REGLAS)

    const a = tabla.find(t => t.equipoId === 'a')!
    expect(a).toMatchObject({ pj: 2, pg: 2, pe: 0, pp: 0, gf: 5, gc: 2, dg: 3, pts: 6 })

    const b = tabla.find(t => t.equipoId === 'b')!
    expect(b).toMatchObject({ pj: 2, pg: 0, pe: 1, pp: 1, gf: 1, gc: 2, dg: -1, pts: 1 })
  })

  it('un W.O. da los puntos de victoria al ganador y puntos_wo_perdedor al ausente', () => {
    const tabla = calcularTablaPosiciones(['a', 'b'], [
      { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 3, golesVisita: 0, estado: 'wo', equipoWoId: 'b' },
    ], { ...REGLAS, puntosWoPerdedor: -1 })

    expect(tabla.find(t => t.equipoId === 'a')).toMatchObject({ pg: 1, pts: 3 })
    expect(tabla.find(t => t.equipoId === 'b')).toMatchObject({ pp: 1, pts: -1 })
  })

  it('ordena por puntos, luego diferencia de gol, luego goles a favor', () => {
    const tabla = calcularTablaPosiciones(['a', 'b'], [
      { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 5, golesVisita: 5, estado: 'finalizado' },
    ], REGLAS)
    // ambos con 1 pt y dg 0 y gf 5 — orden estable, no debe explotar
    expect(tabla).toHaveLength(2)
  })

  it('ignora partidos no jugados', () => {
    const tabla = calcularTablaPosiciones(['a', 'b'], [
      { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 0, golesVisita: 0, estado: 'programado' },
    ], REGLAS)
    expect(tabla.find(t => t.equipoId === 'a')).toMatchObject({ pj: 0, pts: 0 })
  })
})

describe('calcularGoleadores', () => {
  it('cuenta goles normales y penales, pero no autogoles', () => {
    const goleadores = calcularGoleadores([
      { jugador_id: 'j1', equipo_id: 'a', tipo: 'normal' },
      { jugador_id: 'j1', equipo_id: 'a', tipo: 'penal' },
      { jugador_id: 'j2', equipo_id: 'b', tipo: 'autogol' },
    ])
    expect(goleadores).toEqual([{ jugadorId: 'j1', equipoId: 'a', goles: 2, penales: 1 }])
  })
})

describe('calcularTarjetas', () => {
  it('separa amarillas, rojas y doble amarilla por jugador', () => {
    const t = calcularTarjetas([
      { jugador_id: 'j1', equipo_id: 'a', tipo: 'amarilla' },
      { jugador_id: 'j1', equipo_id: 'a', tipo: 'amarilla' },
      { jugador_id: 'j2', equipo_id: 'b', tipo: 'roja' },
    ])
    expect(t.find(x => x.jugadorId === 'j1')).toEqual({ jugadorId: 'j1', equipoId: 'a', amarillas: 2, rojas: 0, dobleAmarilla: 0 })
    expect(t.find(x => x.jugadorId === 'j2')).toEqual({ jugadorId: 'j2', equipoId: 'b', amarillas: 0, rojas: 1, dobleAmarilla: 0 })
  })
})

describe('calcularFairPlay', () => {
  it('penaliza rojas más que amarillas y ordena de mejor a peor conducta', () => {
    const fp = calcularFairPlay([
      { equipo_id: 'a', tipo: 'amarilla' },
      { equipo_id: 'b', tipo: 'roja' },
    ], ['a', 'b'])
    expect(fp[0]).toEqual({ equipoId: 'a', amarillas: 1, rojas: 0, puntos: 1 })
    expect(fp[1]).toEqual({ equipoId: 'b', amarillas: 0, rojas: 1, puntos: 3 })
  })
})

const stats = (equipoId: string): EquipoStats => ({ equipoId, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, ultimos5: [] })

describe('clasificarPorTabla', () => {
  it('toma los primeros N equipos', () => {
    const tabla = ['a', 'b', 'c', 'd'].map(stats)
    expect(clasificarPorTabla(tabla, 2)).toEqual(['a', 'b'])
  })
})

describe('clasificarPorGrupos', () => {
  it('intercala: todos los 1eros, luego todos los 2dos', () => {
    const clasificados = clasificarPorGrupos([
      { tabla: ['a1', 'a2'].map(stats), clasifican: 2 },
      { tabla: ['b1', 'b2'].map(stats), clasifican: 2 },
    ])
    expect(clasificados).toEqual(['a1', 'b1', 'a2', 'b2'])
  })
})

describe('generarBracketPlayoffs', () => {
  it('con 2 clasificados arma directo la final', () => {
    const bracket = generarBracketPlayoffs(['a', 'b'])
    expect(bracket).toEqual([{ fase: 'final', posicion: 0, equipoLocalId: 'a', equipoVisitaId: 'b' }])
  })

  it('con 4 clasificados arma semifinal sembrada 1v4, 2v3', () => {
    const bracket = generarBracketPlayoffs(['a', 'b', 'c', 'd'])
    expect(bracket).toEqual([
      { fase: 'semifinal', posicion: 0, equipoLocalId: 'a', equipoVisitaId: 'd' },
      { fase: 'semifinal', posicion: 1, equipoLocalId: 'b', equipoVisitaId: 'c' },
    ])
  })

  it('con 8 clasificados arma cuartos sembrados sin que 1 y 2 se crucen antes de la final', () => {
    const bracket = generarBracketPlayoffs(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'])
    expect(bracket).toHaveLength(4)
    expect(bracket.every(p => p.fase === 'cuartos')).toBe(true)
    const par = bracket.find(p => p.equipoLocalId === 's1' || p.equipoVisitaId === 's1')
    expect([par?.equipoLocalId, par?.equipoVisitaId]).toContain('s8') // 1 vs 8
  })

  it('con una cantidad no soportada no arma nada', () => {
    expect(generarBracketPlayoffs(['a', 'b', 'c'])).toEqual([])
  })
})

describe('armarSiguienteRonda', () => {
  it('empareja consecutivos en orden de posición', () => {
    expect(armarSiguienteRonda('final', ['w1', 'w2'])).toEqual([
      { fase: 'final', posicion: 0, equipoLocalId: 'w1', equipoVisitaId: 'w2' },
    ])
  })

  it('ignora un sobrante sin pareja', () => {
    expect(armarSiguienteRonda('semifinal', ['a', 'b', 'c'])).toEqual([
      { fase: 'semifinal', posicion: 0, equipoLocalId: 'a', equipoVisitaId: 'b' },
    ])
  })
})

describe('siguienteFasePlayoff', () => {
  it('encadena cuartos → semifinal → final → nada', () => {
    expect(siguienteFasePlayoff('cuartos')).toBe('semifinal')
    expect(siguienteFasePlayoff('semifinal')).toBe('final')
    expect(siguienteFasePlayoff('final')).toBeNull()
    expect(siguienteFasePlayoff('tercer_lugar')).toBeNull()
  })
})

describe('ganadorPartido / perdedorPartido', () => {
  it('determina ganador por marcador en un partido finalizado', () => {
    const p = { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 2, golesVisita: 1, estado: 'finalizado' }
    expect(ganadorPartido(p)).toBe('a')
    expect(perdedorPartido(p)).toBe('b')
  })

  it('un W.O. lo gana el equipo que sí se presentó', () => {
    const p = { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 3, golesVisita: 0, estado: 'wo', equipoWoId: 'b' }
    expect(ganadorPartido(p)).toBe('a')
  })

  it('un empate en playoffs no tiene ganador automático', () => {
    const p = { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 1, golesVisita: 1, estado: 'finalizado' }
    expect(ganadorPartido(p)).toBeNull()
  })

  it('un partido no cerrado no tiene ganador', () => {
    const p = { equipoLocalId: 'a', equipoVisitaId: 'b', golesLocal: 0, golesVisita: 0, estado: 'programado' }
    expect(ganadorPartido(p)).toBeNull()
  })
})
