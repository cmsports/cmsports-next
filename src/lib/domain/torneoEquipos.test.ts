import { describe, it, expect } from 'vitest'
import {
  CRUCES,
  PARTIDOS_PARA_GANAR,
  PARTIDOS_POR_ENCUENTRO,
  SISTEMAS,
  generarPartidosDelEncuentro,
  individualesQuePide,
  minJugadoresPorEquipo,
  proximoPartido,
  resultadoEncuentro,
  validarAlineacion,
  type Alineacion,
  type ResultadoParcial,
} from './torneoEquipos'

const swaythlingA: Alineacion = { individuales: ['a1', 'a2', 'a3'] }
const swaythlingB: Alineacion = { individuales: ['b1', 'b2', 'b3'] }
const corbillonA: Alineacion = { individuales: ['a1', 'a2'], dobles: ['a1', 'a3'] }
const corbillonB: Alineacion = { individuales: ['b1', 'b2'], dobles: ['b1', 'b2'] }

const parciales = (ganadores: Array<'a' | 'b' | null>): ResultadoParcial[] =>
  ganadores.map((g, i) => ({ numero: i + 1, ganador: g }))

// El orden de los cruces es reglamento ITTF. Si alguien lo cambia "para
// mejorarlo", el torneo deja de ser Swaythling o Corbillon.
describe('el orden de los partidos es el del reglamento', () => {
  it('Swaythling es A-X · B-Y · C-Z · A-Y · B-X', () => {
    expect(CRUCES.swaythling.map(c => [c.a[0], c.b[0]])).toEqual([
      [0, 0], // A-X
      [1, 1], // B-Y
      [2, 2], // C-Z
      [0, 1], // A-Y
      [1, 0], // B-X
    ])
  })

  it('Corbillon es A-X · B-Y · dobles · A-Y · B-X', () => {
    expect(CRUCES.corbillon.map(c => c.tipo)).toEqual([
      'individual', 'individual', 'dobles', 'individual', 'individual',
    ])
    const ind = CRUCES.corbillon.filter(c => c.tipo === 'individual')
    expect(ind.map(c => [c.a[0], c.b[0]])).toEqual([[0, 0], [1, 1], [0, 1], [1, 0]])
  })

  it('los dos sistemas tienen cinco partidos', () => {
    for (const s of SISTEMAS) expect(CRUCES[s]).toHaveLength(PARTIDOS_POR_ENCUENTRO)
  })

  // La razón de ser del orden: que el más fuerte y el más débil de cada equipo
  // no jueguen dos veces seguidas.
  it('nadie juega dos partidos consecutivos', () => {
    for (const s of SISTEMAS) {
      const cruces = CRUCES[s].filter(c => c.tipo === 'individual')
      for (let i = 1; i < cruces.length; i++) {
        const previo = CRUCES[s][cruces[i].numero - 2]
        if (!previo || previo.tipo === 'dobles') continue
        expect(cruces[i].a[0], `${s}: el mismo A juega ${previo.numero} y ${cruces[i].numero}`)
          .not.toBe(previo.a[0])
      }
    }
  })

  it('en Swaythling cada uno juega dos veces, salvo C y Z', () => {
    const vecesA = [0, 1, 2].map(i => CRUCES.swaythling.filter(c => c.a[0] === i).length)
    expect(vecesA).toEqual([2, 2, 1])
  })
})

describe('cuántos jugadores necesita un equipo', () => {
  it('Swaythling pide tres, Corbillon dos', () => {
    expect(individualesQuePide('swaythling')).toBe(3)
    expect(individualesQuePide('corbillon')).toBe(2)
    expect(minJugadoresPorEquipo('corbillon')).toBe(2)
  })
})

describe('la alineación se revisa antes de armar los partidos', () => {
  it('acepta las buenas', () => {
    expect(validarAlineacion('swaythling', swaythlingA, 'a')).toBeNull()
    expect(validarAlineacion('corbillon', corbillonA, 'a')).toBeNull()
  })

  it('rechaza que falte gente en los individuales', () => {
    const err = validarAlineacion('swaythling', { individuales: ['a1', 'a2'] }, 'a')
    expect(err?.motivo).toMatch(/3 jugadores/)
    expect(err?.equipo).toBe('a')
  })

  it('rechaza al mismo jugador en dos puestos', () => {
    const err = validarAlineacion('swaythling', { individuales: ['a1', 'a1', 'a3'] }, 'b')
    expect(err?.motivo).toMatch(/dos puestos/)
  })

  it('rechaza un hueco vacío', () => {
    const err = validarAlineacion('swaythling', { individuales: ['a1', '', 'a3'] }, 'a')
    expect(err?.motivo).toMatch(/Falta asignar/)
  })

  it('en Corbillon exige la pareja de dobles', () => {
    const err = validarAlineacion('corbillon', { individuales: ['a1', 'a2'] }, 'a')
    expect(err?.motivo).toMatch(/dobles/)
  })

  it('la pareja de dobles no puede ser la misma persona dos veces', () => {
    const err = validarAlineacion('corbillon', { individuales: ['a1', 'a2'], dobles: ['a1', 'a1'] }, 'a')
    expect(err?.motivo).toMatch(/distintos/)
  })

  // El reglamento lo permite y es parte de por qué Corbillon admite equipos de
  // hasta cuatro jugadores.
  it('el dobles puede tener jugadores que no juegan individuales', () => {
    const al: Alineacion = { individuales: ['a1', 'a2'], dobles: ['a3', 'a4'] }
    expect(validarAlineacion('corbillon', al, 'a')).toBeNull()
  })

  it('en Swaythling no hace falta declarar dobles', () => {
    expect(validarAlineacion('swaythling', swaythlingA, 'a')).toBeNull()
  })
})

describe('los partidos salen con las personas puestas', () => {
  it('Swaythling arma los cinco individuales según el orden', () => {
    const partidos = generarPartidosDelEncuentro('swaythling', swaythlingA, swaythlingB)
    expect(partidos.map(p => [p.jugadoresA[0], p.jugadoresB[0]])).toEqual([
      ['a1', 'b1'], // A-X
      ['a2', 'b2'], // B-Y
      ['a3', 'b3'], // C-Z
      ['a1', 'b2'], // A-Y
      ['a2', 'b1'], // B-X
    ])
    expect(partidos.every(p => p.tipo === 'individual')).toBe(true)
  })

  it('Corbillon pone el dobles en el medio, con cuatro jugadores', () => {
    const partidos = generarPartidosDelEncuentro('corbillon', corbillonA, corbillonB)
    const dobles = partidos[2]
    expect(dobles.tipo).toBe('dobles')
    expect(dobles.jugadoresA).toEqual(['a1', 'a3'])
    expect(dobles.jugadoresB).toEqual(['b1', 'b2'])
    expect(dobles.jugadoresA.length + dobles.jugadoresB.length).toBe(4)
  })

  it('los individuales de Corbillon quedan en el orden del reglamento', () => {
    const partidos = generarPartidosDelEncuentro('corbillon', corbillonA, corbillonB)
    const ind = partidos.filter(p => p.tipo === 'individual')
    expect(ind.map(p => [p.jugadoresA[0], p.jugadoresB[0]])).toEqual([
      ['a1', 'b1'], ['a2', 'b2'], ['a1', 'b2'], ['a2', 'b1'],
    ])
  })

  // Se generan los cinco aunque el encuentro se corte antes: los capitanes
  // miran el encuentro completo para decidir su alineación.
  it('siempre genera los cinco', () => {
    expect(generarPartidosDelEncuentro('swaythling', swaythlingA, swaythlingB)).toHaveLength(5)
    expect(generarPartidosDelEncuentro('corbillon', corbillonA, corbillonB)).toHaveLength(5)
  })
})

// ⚠️ La diferencia más grande con el resto del módulo: acá NO se juegan todos
// los partidos generados. Un 3-0 deja dos sin jugar y eso es correcto.
describe('el encuentro se corta apenas alguien llega a tres', () => {
  it('un 3-0 deja los partidos 4 y 5 sin jugar', () => {
    const r = resultadoEncuentro(parciales(['a', 'a', 'a', null, null]))
    expect(r.puntosA).toBe(3)
    expect(r.puntosB).toBe(0)
    expect(r.ganador).toBe('a')
    expect(r.terminado).toBe(true)
    expect(r.noSeJuegan).toEqual([4, 5])
  })

  it('un 3-1 deja solo el quinto sin jugar', () => {
    const r = resultadoEncuentro(parciales(['a', 'b', 'a', 'a', null]))
    expect(r.puntosA).toBe(3)
    expect(r.puntosB).toBe(1)
    expect(r.noSeJuegan).toEqual([5])
  })

  it('un 3-2 juega los cinco', () => {
    const r = resultadoEncuentro(parciales(['a', 'b', 'a', 'b', 'a']))
    expect(r.puntosA).toBe(3)
    expect(r.puntosB).toBe(2)
    expect(r.ganador).toBe('a')
    expect(r.noSeJuegan).toEqual([])
  })

  it('a mitad de camino todavía no hay ganador', () => {
    const r = resultadoEncuentro(parciales(['a', 'b', null, null, null]))
    expect(r.terminado).toBe(false)
    expect(r.ganador).toBeNull()
    expect(r.noSeJuegan).toEqual([])
  })

  it('nunca suma más de tres al ganador', () => {
    // Aunque alguien cargue resultados de más, el marcador se corta en 3.
    const r = resultadoEncuentro(parciales(['b', 'b', 'b', 'b', 'b']))
    expect(r.puntosB).toBe(3)
    expect(r.ganador).toBe('b')
    expect(r.noSeJuegan).toEqual([4, 5])
  })

  it('sin ningún partido jugado, cero a cero', () => {
    const r = resultadoEncuentro(parciales([null, null, null, null, null]))
    expect(r).toMatchObject({ puntosA: 0, puntosB: 0, ganador: null, terminado: false })
  })

  it('cuenta en orden aunque lleguen desordenados', () => {
    const desordenados: ResultadoParcial[] = [
      { numero: 3, ganador: 'a' },
      { numero: 1, ganador: 'a' },
      { numero: 2, ganador: 'a' },
      { numero: 4, ganador: 'b' },
      { numero: 5, ganador: 'b' },
    ]
    const r = resultadoEncuentro(desordenados)
    expect(r.ganador).toBe('a')
    expect(r.noSeJuegan).toEqual([4, 5])
  })

  it('hacen falta tres para ganar', () => {
    expect(PARTIDOS_PARA_GANAR).toBe(3)
  })
})

describe('a quién llamar a la mesa ahora', () => {
  it('el primero sin jugar', () => {
    expect(proximoPartido(parciales(['a', 'b', null, null, null]))).toBe(3)
  })

  it('el primero de todos si no empezó', () => {
    expect(proximoPartido(parciales([null, null, null, null, null]))).toBe(1)
  })

  it('nadie más si el encuentro terminó', () => {
    expect(proximoPartido(parciales(['a', 'a', 'a', null, null]))).toBeNull()
  })

  it('salta un hueco si el orden se cargó salteado', () => {
    expect(proximoPartido(parciales(['a', null, 'b', null, null]))).toBe(2)
  })
})
