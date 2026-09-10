import { describe, it, expect } from 'vitest'
import {
  consolacionLista,
  elegiblesParaConsolacion,
  esFaseDeConsolacion,
  generarCuadroConsolacion,
  generarCuadroDirecto,
  maxCabezasDeCuadro,
  ordenarParaCuadroDirecto,
  partidosJugadosPorJugador,
  siguienteFaseDeCualquierCuadro,
  type PartidoJugado,
} from './torneoConsolacion'
import { calcularTamanoBracket, determinarFaseInicial, type JugadorTorneo } from './torneos'
import { CONFIG } from '../config'

const jugadores = (n: number): JugadorTorneo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre: `Jugador ${i + 1}` }))

/**
 * Juega el cuadro principal entero y devuelve los partidos como los guardaría
 * la base. `decidir` elige al ganador, para poder correr el mismo torneo con
 * resultados distintos.
 */
function simularCuadro(n: number, decidir: (a: string, b: string) => string): PartidoJugado[] {
  const inicial = generarCuadroDirecto(jugadores(n))
  const jugados: PartidoJugado[] = []

  // Ronda 1 tal cual la generó el armador, respetando su orden.
  const ronda = [...inicial].sort((a, b) => a.orden - b.orden)
  let fase: string | null = ronda[0]?.fase ?? null
  let vivos: string[] = []

  for (const p of ronda) {
    if (!p.jugadorB) {
      // BYE: la llave existe pero nadie jugó. No se registra como partido.
      if (p.jugadorA) vivos.push(p.jugadorA)
      continue
    }
    const ganador = decidir(p.jugadorA, p.jugadorB)
    jugados.push({ fase, jugador_a: p.jugadorA, jugador_b: p.jugadorB, ganador })
    vivos.push(ganador)
  }

  // Rondas siguientes: los ganadores se enfrentan de a pares, en orden.
  const orden = CONFIG.FASES_ORDEN
  let i = orden.indexOf(fase as never)
  while (vivos.length > 1) {
    i += 1
    fase = orden[i] ?? 'final'
    const siguientes: string[] = []
    for (let k = 0; k < vivos.length; k += 2) {
      const a = vivos[k]
      const b = vivos[k + 1]
      if (!b) { siguientes.push(a); continue }
      const ganador = decidir(a, b)
      jugados.push({ fase, jugador_a: a, jugador_b: b, ganador })
      siguientes.push(ganador)
    }
    vivos = siguientes
  }

  return jugados
}

const ganaA = (a: string) => a
const ganaB = (_a: string, b: string) => b

describe('el cuadro se arma sin pasar por grupos', () => {
  // La hipótesis del plan, comprobada EJECUTANDO y no leyendo:
  // `construirBracketPorRanking` trae tres ajustes que solo sirven cuando los
  // clasificados vienen de grupos. Con un `grupoIdx` propio por jugador tienen
  // que apagarse solos y dejar la siembra bit-reversal pura.
  it('el sembrado deja al 1 y al 2 en mitades opuestas', () => {
    for (const n of [8, 11, 16, 23, 32]) {
      const partidos = generarCuadroDirecto(jugadores(n))
      const tam = calcularTamanoBracket(n)
      const llaves = [...partidos].sort((a, b) => a.orden - b.orden)

      const llaveDe = (id: string) => llaves.findIndex(p => p.jugadorA === id || p.jugadorB === id)
      const mitadDe = (id: string) => (llaveDe(id) < llaves.length / 2 ? 0 : 1)

      expect(llaves).toHaveLength(tam / 2)
      expect(mitadDe('j1'), `n=${n}`).not.toBe(mitadDe('j2'))
    }
  })

  it('los BYE se los llevan los mejores sembrados', () => {
    // 11 en un cuadro de 16: cinco BYE, y le tocan a los cinco primeros.
    const partidos = [...generarCuadroDirecto(jugadores(11))].sort((a, b) => a.orden - b.orden)
    const conBye = partidos.filter(p => !p.jugadorB).map(p => p.jugadorA)
    expect(conBye).toHaveLength(5)
    expect(new Set(conBye)).toEqual(new Set(['j1', 'j2', 'j3', 'j4', 'j5']))
  })

  it('nadie queda emparejado consigo mismo ni aparece dos veces', () => {
    for (const n of [5, 11, 16, 23]) {
      const partidos = generarCuadroDirecto(jugadores(n))
      const ids = partidos.flatMap(p => [p.jugadorA, p.jugadorB]).filter(Boolean) as string[]
      expect(new Set(ids).size, `n=${n}`).toBe(n)
    }
  })

  it('la fase inicial es la que corresponde al tamaño del cuadro', () => {
    for (const n of [5, 11, 16, 23, 40]) {
      const partidos = generarCuadroDirecto(jugadores(n))
      expect(partidos[0].fase).toBe(determinarFaseInicial(calcularTamanoBracket(n)))
    }
  })

  it('las cabezas de serie van primero, en su número', () => {
    const orden = ordenarParaCuadroDirecto(jugadores(8), [
      { jugadorId: 'j5', numero: 2 },
      { jugadorId: 'j7', numero: 1 },
    ])
    expect(orden[0].jugadorId).toBe('j7')
    expect(orden[1].jugadorId).toBe('j5')
    expect(orden[0].cabezaNumero).toBe(1)
    // Y cada uno con su propio grupoIdx, que es lo que apaga los ajustes.
    expect(new Set(orden.map(o => o.grupoIdx)).size).toBe(orden.length)
    expect(orden.every(o => o.posicion === 1)).toBe(true)
  })

  it('el tope de cabezas es una potencia de 2 y nunca más de media llave', () => {
    expect(maxCabezasDeCuadro(3)).toBe(0)
    expect(maxCabezasDeCuadro(8)).toBe(4)
    expect(maxCabezasDeCuadro(11)).toBe(8)
    expect(maxCabezasDeCuadro(16)).toBe(8)
    expect(maxCabezasDeCuadro(32)).toBe(16)
  })
})

describe('quién entra al cuadro de consuelo', () => {
  it('cuenta partidos jugados, y un BYE no es un partido', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
      { fase: '8vos', jugador_a: 'c', jugador_b: null, ganador: null },
      { fase: 'cuartos', jugador_a: 'a', jugador_b: 'c', ganador: 'c' },
    ]
    const jugados = partidosJugadosPorJugador(partidos)
    expect(jugados.get('a')).toBe(2)
    expect(jugados.get('b')).toBe(1)
    expect(jugados.get('c')).toBe(1)
  })

  // El caso que motiva todo el formato. Sin esto, el sembrado #1 que pierde su
  // primer partido se va a casa mientras el cuadro promete lo contrario.
  it('el que tuvo BYE y pierde en la segunda ronda ENTRA', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'sembrado', jugador_b: null, ganador: null },
      { fase: '8vos', jugador_a: 'x', jugador_b: 'y', ganador: 'x' },
      { fase: 'cuartos', jugador_a: 'sembrado', jugador_b: 'x', ganador: 'x' },
    ]
    const elegibles = elegiblesParaConsolacion(partidos)
    expect(elegibles).toContain('sembrado')
    expect(elegibles).toContain('y')
  })

  it('el que perdió su segundo partido NO entra', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
      { fase: 'cuartos', jugador_a: 'a', jugador_b: 'c', ganador: 'c' },
    ]
    expect(elegiblesParaConsolacion(partidos)).toEqual(['b'])
  })

  it('no cuenta los partidos del propio cuadro de consuelo', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
      { fase: 'cons_cuartos', jugador_a: 'b', jugador_b: 'z', ganador: 'z' },
    ]
    // `b` sigue teniendo un solo partido del cuadro principal.
    expect(elegiblesParaConsolacion(partidos)).toContain('b')
  })

  it('nadie entra dos veces', () => {
    const elegibles = elegiblesParaConsolacion(simularCuadro(23, ganaA))
    expect(new Set(elegibles).size).toBe(elegibles.length)
  })
})

// ═══ La prueba del formato ═════════════════════════════════════════════════
//
// El club pidió esto con una sola frase: "para que nadie juegue un solo
// partido". Si esta prueba falla, el formato no cumple lo que promete, por más
// que todo lo demás esté bien.
describe('la promesa: nadie juega un solo partido', () => {
  for (const n of [8, 11, 12, 16, 23, 24, 32]) {
    for (const [nombre, decidir] of [['gana el primero', ganaA], ['gana el segundo', ganaB]] as const) {
      it(`con ${n} inscritos (${nombre}), todo eliminado con un partido va al consuelo`, () => {
        const partidos = simularCuadro(n, decidir)
        const jugados = partidosJugadosPorJugador(partidos)
        const elegibles = new Set(elegiblesParaConsolacion(partidos))

        const conUnSoloPartido = [...jugados.entries()]
          .filter(([, veces]) => veces === 1)
          .map(([id]) => id)

        // El campeón puede tener pocos partidos, pero no está eliminado.
        const campeon = partidos.at(-1)?.ganador
        for (const id of conUnSoloPartido) {
          if (id === campeon) continue
          expect(elegibles.has(id), `${id} jugó 1 partido y quedó fuera del consuelo`).toBe(true)
        }
      })
    }
  }

  it('con 11 inscritos entran los perdedores de la 1ª ronda Y los sembrados que caen en la 2ª', () => {
    const partidos = simularCuadro(11, ganaB)
    const elegibles = elegiblesParaConsolacion(partidos)
    // 3 partidos reales en la primera ronda y 4 en la segunda; los que venían
    // de BYE y perdieron se suman a los tres primeros perdedores.
    expect(elegibles.length).toBeGreaterThan(3)
  })
})

describe('cuándo se puede armar el cuadro de consuelo', () => {
  it('no antes de que terminen las dos primeras rondas', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
      { fase: '8vos', jugador_a: 'c', jugador_b: 'd', ganador: null },
    ]
    expect(consolacionLista({ partidos, faseInicial: '8vos' })).toBe(false)
  })

  it('sí cuando las dos están completas, contando los BYE como resueltos', () => {
    const partidos: PartidoJugado[] = [
      { fase: '8vos', jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
      { fase: '8vos', jugador_a: 'c', jugador_b: null, ganador: null },
      { fase: 'cuartos', jugador_a: 'a', jugador_b: 'c', ganador: 'c' },
    ]
    expect(consolacionLista({ partidos, faseInicial: '8vos' })).toBe(true)
  })

  it('sin partidos todavía, no está lista', () => {
    expect(consolacionLista({ partidos: [], faseInicial: '8vos' })).toBe(false)
  })
})

// Sin esto, un partido del cuadro de consuelo se juega y su ganador no avanza
// a ningún lado: `siguienteFase()` no conoce las fases `cons_*` y devuelve
// null. No da error y no se ve hasta que alguien pregunta dónde está su
// próximo partido.
describe('los ganadores del consuelo también avanzan', () => {
  it('salta a la fase espejo del consuelo', () => {
    expect(siguienteFaseDeCualquierCuadro('cons_8vos')).toBe('cons_cuartos')
    expect(siguienteFaseDeCualquierCuadro('cons_cuartos')).toBe('cons_semis')
    expect(siguienteFaseDeCualquierCuadro('cons_semis')).toBe('cons_final')
  })

  it('la final del consuelo no lleva a ninguna parte', () => {
    expect(siguienteFaseDeCualquierCuadro('cons_final')).toBeNull()
  })

  it('el cuadro principal sigue funcionando igual que antes', () => {
    expect(siguienteFaseDeCualquierCuadro('8vos')).toBe('cuartos')
    expect(siguienteFaseDeCualquierCuadro('semis')).toBe('final')
    expect(siguienteFaseDeCualquierCuadro('final')).toBeNull()
  })

  it('una fase que no es de cuadro no avanza', () => {
    expect(siguienteFaseDeCualquierCuadro('grupos')).toBeNull()
    expect(siguienteFaseDeCualquierCuadro('tercer_lugar')).toBeNull()
    expect(siguienteFaseDeCualquierCuadro(null)).toBeNull()
    expect(siguienteFaseDeCualquierCuadro('cualquier cosa')).toBeNull()
  })

  it('nunca cruza un cuadro con el otro', () => {
    for (const f of ['cons_avance', 'cons_32vos', 'cons_16vos', 'cons_8vos', 'cons_cuartos', 'cons_semis']) {
      const sig = siguienteFaseDeCualquierCuadro(f)
      expect(sig && esFaseDeConsolacion(sig), `${f} salió del consuelo`).toBe(true)
    }
    for (const f of ['avance', '32vos', '16vos', '8vos', 'cuartos', 'semis']) {
      const sig = siguienteFaseDeCualquierCuadro(f)
      expect(sig && esFaseDeConsolacion(sig)).toBe(false)
    }
  })
})

describe('el cuadro de consuelo tiene sus propias fases', () => {
  it('todas empiezan con cons_', () => {
    const partidos = generarCuadroConsolacion(jugadores(8))
    expect(partidos.length).toBeGreaterThan(0)
    for (const p of partidos) expect(esFaseDeConsolacion(p.fase)).toBe(true)
  })

  // El índice único de (torneo_id, fase, orden) haría chocar los dos cuadros si
  // compartieran nombre de fase.
  it('ninguna fase del consuelo coincide con una del cuadro principal', () => {
    const principal = new Set(generarCuadroDirecto(jugadores(16)).map(p => p.fase))
    const consuelo = new Set(generarCuadroConsolacion(jugadores(8)).map(p => p.fase))
    for (const f of consuelo) expect(principal.has(f)).toBe(false)
  })

  it('con menos de dos jugadores no hay cuadro de consuelo', () => {
    expect(generarCuadroConsolacion(jugadores(1))).toEqual([])
    expect(generarCuadroConsolacion([])).toEqual([])
  })

  it('esFaseDeConsolacion no se confunde con las del principal', () => {
    expect(esFaseDeConsolacion('cuartos')).toBe(false)
    expect(esFaseDeConsolacion('cons_cuartos')).toBe(true)
    expect(esFaseDeConsolacion(null)).toBe(false)
  })
})
