import { describe, expect, it } from 'vitest'
import { calcularStatsGrupo, grupoTieneSusDosCuposDecididos, construirLlavesLayoutNumerado } from './torneos'

// Arma stats + partidos pendientes a partir de una lista de partidos, igual que
// lo hace calcularClasificadosDesdeBD en el servidor.
function situacion(
  jugadores: string[],
  partidos: Array<{ jugadorA: string; jugadorB: string; ganador: string | null }>,
) {
  const { stats } = calcularStatsGrupo(
    jugadores.map(id => ({ id, nombre: id })),
    partidos.filter(p => p.ganador),
  )
  const pendientes = new Map<string, number>(jugadores.map(j => [j, 0]))
  for (const p of partidos) {
    if (p.ganador) continue
    pendientes.set(p.jugadorA, (pendientes.get(p.jugadorA) ?? 0) + 1)
    pendientes.set(p.jugadorB, (pendientes.get(p.jugadorB) ?? 0) + 1)
  }
  const todosJugados = partidos.every(p => p.ganador)
  return { stats, pendientes, todosJugados }
}

const decidido = (
  jugadores: string[],
  partidos: Array<{ jugadorA: string; jugadorB: string; ganador: string | null }>,
) => {
  const s = situacion(jugadores, partidos)
  return grupoTieneSusDosCuposDecididos(s.stats, s.pendientes, s.todosJugados)
}

describe('grupoTieneSusDosCuposDecididos', () => {
  // El caso real: grupo B del sub19 de Buin, 2026-08-16. Randy y Vicente
  // ganaron su partido contra Agustín y todavía no se habían enfrentado.
  // Antes de este arreglo el grupo se daba por cerrado, se desempataba por
  // orden de siembra (Randy iba sembrado antes) y la llave quedaba con Randy
  // como 1° — cuando después Vicente le ganó y el 1° era Vicente.
  it('NO cierra el grupo si los dos punteros aun no se enfrentan', () => {
    const abierto = decidido(['agustin', 'randy', 'vicente'], [
      { jugadorA: 'agustin', jugadorB: 'randy', ganador: 'randy' },
      { jugadorA: 'agustin', jugadorB: 'vicente', ganador: 'vicente' },
      { jugadorA: 'randy', jugadorB: 'vicente', ganador: null },
    ])
    expect(abierto).toBe(false)
  })

  it('cierra el grupo cuando ese partido se juega, y con el orden correcto', () => {
    const partidos = [
      { jugadorA: 'agustin', jugadorB: 'randy', ganador: 'randy' },
      { jugadorA: 'agustin', jugadorB: 'vicente', ganador: 'vicente' },
      { jugadorA: 'randy', jugadorB: 'vicente', ganador: 'vicente' },
    ]
    expect(decidido(['agustin', 'randy', 'vicente'], partidos)).toBe(true)
    const { stats } = situacion(['agustin', 'randy', 'vicente'], partidos)
    expect(stats[0].jugadorId).toBe('vicente')
    expect(stats[1].jugadorId).toBe('randy')
  })

  // Lo que NO se puede romper: la llave tiene que poder jugarse mientras otros
  // grupos siguen en curso, así que un grupo cuyo orden ya no puede cambiar
  // debe cerrarse aunque le queden partidos por jugar.
  // Esto es lo que NO se puede romper con el arreglo: la llave tiene que poder
  // armarse y jugarse mientras el grupo sigue teniendo partidos por delante,
  // siempre que esos partidos ya no cambien nada de sus dos cupos.
  it('cierra aunque queden partidos, si ninguno puede mover a los dos primeros', () => {
    // ana 6 pts y beto 4, los dos sin partidos pendientes. Queda cami-dario,
    // que como mucho deja al ganador en 2 pts: no alcanza al 2° ni mueve el
    // orden de arriba.
    const cerrado = decidido(['ana', 'beto', 'cami', 'dario'], [
      { jugadorA: 'ana', jugadorB: 'beto', ganador: 'ana' },
      { jugadorA: 'ana', jugadorB: 'cami', ganador: 'ana' },
      { jugadorA: 'ana', jugadorB: 'dario', ganador: 'ana' },
      { jugadorA: 'beto', jugadorB: 'cami', ganador: 'beto' },
      { jugadorA: 'beto', jugadorB: 'dario', ganador: 'beto' },
      { jugadorA: 'cami', jugadorB: 'dario', ganador: null },
    ])
    expect(cerrado).toBe(true)
  })

  it('no cierra si el 3° todavia puede alcanzar al 2°', () => {
    // ana 4, beto 2, cami 0 con un partido pendiente: cami puede llegar a 2 y
    // empatarle el 2° puesto a beto.
    const abierto = decidido(['ana', 'beto', 'cami', 'dario'], [
      { jugadorA: 'ana', jugadorB: 'beto', ganador: 'ana' },
      { jugadorA: 'ana', jugadorB: 'cami', ganador: 'ana' },
      { jugadorA: 'beto', jugadorB: 'cami', ganador: 'beto' },
      { jugadorA: 'ana', jugadorB: 'dario', ganador: null },
      { jugadorA: 'beto', jugadorB: 'dario', ganador: null },
      { jugadorA: 'cami', jugadorB: 'dario', ganador: null },
    ])
    expect(abierto).toBe(false)
  })

  it('con todos los partidos jugados siempre esta decidido', () => {
    expect(decidido(['ana', 'beto', 'cami'], [
      { jugadorA: 'ana', jugadorB: 'beto', ganador: 'ana' },
      { jugadorA: 'ana', jugadorB: 'cami', ganador: 'ana' },
      { jugadorA: 'beto', jugadorB: 'cami', ganador: 'beto' },
    ])).toBe(true)
  })
})

// Antes, si el grupo de una cabeza de serie no habia cerrado, el servidor la
// daba por 1° de su grupo para poder sembrarla igual. Eso se elimino: ser
// cabeza de serie es una expectativa al sembrar, no un resultado. Una cabeza
// entra al sembrado recien cuando su grupo cierra; hasta entonces simplemente
// no se la posiciona. Estos casos fijan que el cuadro sale bien igual.
describe('el cuadro se arma sin suponer el puesto de nadie', () => {
  const puestos = (cabezas: { numero: number; grupoIdx: number; pos: 1 | 2 }[]) => {
    const l = construirLlavesLayoutNumerado(8, cabezas, [0, 1, 2, 3, 4, 5, 6, 7])
    return l.matches.filter(m => m.a && m.b)
  }

  it('sin ninguna cabeza sembrada, igual cruza 1° contra 2°', () => {
    const primeraRonda = puestos([])
    expect(primeraRonda).toHaveLength(8)
    expect(primeraRonda.filter(m => m.a!.pos === m.b!.pos)).toHaveLength(0)
  })

  it('nunca enfrenta al 1° y al 2° del mismo grupo en la ronda inicial', () => {
    for (const cabezas of [[], [{ numero: 1, grupoIdx: 0, pos: 1 as const }]]) {
      const mismoGrupo = puestos(cabezas).filter(m => m.a!.grupoIdx === m.b!.grupoIdx)
      expect(mismoGrupo).toHaveLength(0)
    }
  })

  it('una cabeza que resulto 2° de su grupo se siembra como 2°, no como 1°', () => {
    // Es el caso que antes se suponia al reves. El cuadro tiene que aceptarlo
    // y seguir cruzando 1° contra 2°.
    const primeraRonda = puestos([{ numero: 1, grupoIdx: 3, pos: 2 }])
    expect(primeraRonda).toHaveLength(8)
    expect(primeraRonda.filter(m => m.a!.pos === m.b!.pos)).toHaveLength(0)
  })
})
